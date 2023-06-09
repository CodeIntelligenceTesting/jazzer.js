/*
 * Copyright 2022 Code Intelligence GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import path from "path";
import * as process from "process";
import * as tmp from "tmp";
import * as fs from "fs";

import * as libCoverage from "istanbul-lib-coverage";
import * as libReport from "istanbul-lib-report";
import * as reports from "istanbul-reports";

import * as fuzzer from "@jazzer.js/fuzzer";
import * as hooking from "@jazzer.js/hooking";
import {
	clearFirstFinding,
	Finding,
	getFirstFinding,
	loadBugDetectors,
} from "@jazzer.js/bug-detectors";
import {
	FileSyncIdStrategy,
	Instrumentor,
	MemorySyncIdStrategy,
	registerInstrumentor,
} from "@jazzer.js/instrumentor";
import { builtinModules } from "module";

// Remove temporary files on exit
tmp.setGracefulCleanup();

// libFuzzer uses exit code 77 in case of a crash, so use a similar one for
// failed error expectations.
const ERROR_EXPECTED_CODE = 0;
const ERROR_UNEXPECTED_CODE = 78;

export interface Options {
	// `fuzzTarget` is the name of an external module containing a `fuzzer.FuzzTarget`
	// that is resolved by `fuzzEntryPoint`.
	fuzzTarget: string;
	fuzzEntryPoint: string;
	includes: string[];
	excludes: string[];
	dryRun: boolean;
	sync: boolean;
	fuzzerOptions: string[];
	customHooks: string[];
	expectedErrors: string[];
	timeout: number;
	idSyncFile?: string;
	coverage: boolean; // Enables source code coverage report generation.
	coverageDirectory: string;
	coverageReporters: reports.ReportType[];
	disableBugDetectors: RegExp[];
}

interface FuzzModule {
	[fuzzEntryPoint: string]: fuzzer.FuzzTarget;
}

/* eslint no-var: 0 */
declare global {
	var Fuzzer: fuzzer.Fuzzer;
	var HookManager: hooking.HookManager;
	var __coverage__: libCoverage.CoverageMapData;
	var options: Options;
}

export async function initFuzzing(options: Options) {
	registerGlobals();
	registerInstrumentor(
		new Instrumentor(
			options.includes,
			options.excludes,
			options.customHooks,
			options.coverage,
			options.dryRun,
			options.idSyncFile !== undefined
				? new FileSyncIdStrategy(options.idSyncFile)
				: new MemorySyncIdStrategy()
		)
	);
	// Loads custom hook files and adds them to the hook manager.
	await Promise.all(options.customHooks.map(ensureFilepath).map(importModule));

	// Load built-in bug detectors. Some of them might register hooks with the hook manager.
	// Each bug detector is written in its own file, and theoretically could be loaded in the same way as custom hooks
	// above. However, the path the bug detectors must be the compiled path. For this reason we decided to load them
	// using this function, which loads each bug detector relative to the bug-detectors directory. E.g., in Jazzer
	// (without the .js) there is no distinction between custom hooks and bug detectors.
	await loadBugDetectors(options.disableBugDetectors);

	// Built-in functions cannot be hooked by the instrumentor, so we manually hook them here.
	await hookBuiltInFunctions(hooking.hookManager);
}

// Built-in functions cannot be hooked by the instrumentor. We hook them by overwriting them at the module level.
async function hookBuiltInFunctions(hookManager: hooking.HookManager) {
	for (const builtinModule of builtinModules) {
		for (const hook of hookManager.getMatchingHooks(builtinModule)) {
			try {
				await hooking.hookBuiltInFunction(hook);
			} catch (e) {
				if (process.env.JAZZER_DEBUG) {
					console.log(
						"DEBUG: [Hook] Error when trying to hook the built-in function: " +
							e
					);
				}
			}
		}
	}
}

export function registerGlobals() {
	globalThis.Fuzzer = fuzzer.fuzzer;
	globalThis.HookManager = hooking.hookManager;
}

export async function startFuzzing(options: Options) {
	await initFuzzing(options);
	const fuzzFn = await loadFuzzFunction(options);

	await startFuzzingNoInit(fuzzFn, options).then(
		() => {
			stopFuzzing(
				undefined,
				options.expectedErrors,
				options.coverageDirectory,
				options.coverageReporters,
				options.sync
			);
		},
		(err: unknown) => {
			stopFuzzing(
				err,
				options.expectedErrors,
				options.coverageDirectory,
				options.coverageReporters,
				options.sync
			);
		}
	);
}

function logInfoAboutFuzzerOptions(fuzzerOptions: string[]) {
	fuzzerOptions.slice(1).forEach((element) => {
		if (element.length > 0 && element[0] != "-") {
			console.error("INFO: using inputs from:", element);
		}
	});
}

export async function startFuzzingNoInit(
	fuzzFn: fuzzer.FuzzTarget,
	options: Options
) {
	const fuzzerOptions = buildFuzzerOptions(options);
	logInfoAboutFuzzerOptions(fuzzerOptions);
	const fuzzerFn = options.sync
		? Fuzzer.startFuzzing
		: Fuzzer.startFuzzingAsync;
	// Wrap the potentially sync fuzzer call, so that resolve and exception
	// handlers are always executed.
	return Promise.resolve().then(() => fuzzerFn(fuzzFn, fuzzerOptions));
}

function prepareLibFuzzerArg0(fuzzerOptions: string[]): string {
	// When we run in a libFuzzer mode that spawns subprocesses, we create a wrapper script
	// that can be used as libFuzzer's argv[0]. In the fork mode, the main libFuzzer process
	// uses argv[0] to spawn further processes that perform the actual fuzzing.
	const libFuzzerSpawnsProcess = fuzzerOptions.some(
		(flag) =>
			flag.startsWith("-fork=") ||
			flag.startsWith("-jobs=") ||
			flag.startsWith("-merge=")
	);

	if (!libFuzzerSpawnsProcess) {
		// Return a fake argv[0] to start the fuzzer if libFuzzer does not spawn new processes.
		return "unused_arg0_report_a_bug_if_you_see_this";
	} else {
		// Create a wrapper script and return its path.
		return createWrapperScript(fuzzerOptions);
	}
}

function createWrapperScript(fuzzerOptions: string[]) {
	const jazzerArgs = process.argv.filter(
		(arg) => arg !== "--" && fuzzerOptions.indexOf(arg) === -1
	);

	if (jazzerArgs.indexOf("--id_sync_file") === -1) {
		const idSyncFile = tmp.fileSync({
			mode: 0o600,
			prefix: "jazzer.js",
			postfix: "idSync",
		});
		jazzerArgs.push("--id_sync_file", idSyncFile.name);
		fs.closeSync(idSyncFile.fd);
	}

	const isWindows = process.platform === "win32";

	const scriptContent = `${isWindows ? "@echo off" : "#!/usr/bin/env sh"}
cd "${process.cwd()}"
${jazzerArgs.map((s) => '"' + s + '"').join(" ")} -- ${isWindows ? "%*" : "$@"}
`;

	const scriptTempFile = tmp.fileSync({
		mode: 0o700,
		prefix: "jazzer.js",
		postfix: "libfuzzer" + (isWindows ? ".bat" : ".sh"),
	});
	fs.writeFileSync(scriptTempFile.name, scriptContent);
	fs.closeSync(scriptTempFile.fd);

	return scriptTempFile.name;
}

function stopFuzzing(
	err: unknown,
	expectedErrors: string[],
	coverageDirectory: string,
	coverageReporters: reports.ReportType[],
	sync: boolean
) {
	const stopFuzzing = sync ? Fuzzer.stopFuzzing : Fuzzer.stopFuzzingAsync;
	if (process.env.JAZZER_DEBUG) {
		hooking.trackedHooks.categorizeUnknown(HookManager.hooks).print();
	}
	// Generate a coverage report in fuzzing mode (non-jest). The coverage report for our jest-runner is generated
	// by jest internally (as long as '--coverage' is set).
	if (global.__coverage__) {
		const coverageMap = libCoverage.createCoverageMap(global.__coverage__);
		const context = libReport.createContext({
			dir: coverageDirectory,
			watermarks: {},
			coverageMap: coverageMap,
		});
		coverageReporters.forEach((reporter) =>
			reports.create(reporter).execute(context)
		);
	}

	// No error found, check if one is expected.
	if (!err) {
		if (expectedErrors.length) {
			console.error(
				`ERROR: Received no error, but expected one of [${expectedErrors}].`
			);
			stopFuzzing(ERROR_UNEXPECTED_CODE);
		}
		return;
	}

	// Error found and expected, check if it's one of the expected ones.
	if (expectedErrors.length) {
		const name = errorName(err);
		if (expectedErrors.includes(name)) {
			console.error(`INFO: Received expected error "${name}".`);
			stopFuzzing(ERROR_EXPECTED_CODE);
		} else {
			printError(err);
			console.error(
				`ERROR: Received error "${name}" is not in expected errors [${expectedErrors}].`
			);
			stopFuzzing(ERROR_UNEXPECTED_CODE);
		}
		return;
	}

	// Error found, but no specific one expected. This case is used for normal
	// fuzzing runs, so no dedicated exit code is given to the stop fuzzing function.
	printError(err);
	stopFuzzing();
}

function errorName(error: unknown): string {
	if (error instanceof Error) {
		// error objects
		return error.name;
	} else if (typeof error !== "object") {
		// primitive types
		return String(error);
	} else {
		// Arrays and objects can not be converted to a proper name and so
		// not be stated as expected error.
		return "unknown";
	}
}

function printError(error: unknown) {
	let errorMessage = `==${process.pid}== `;
	if (!(error instanceof Finding)) {
		errorMessage += "Uncaught Exception: Jazzer.js: ";
	}

	if (error instanceof Error) {
		errorMessage += error.message;
		console.log(errorMessage);
		if (error.stack) {
			console.log(cleanErrorStack(error));
		}
	} else if (typeof error === "string" || error instanceof String) {
		errorMessage += error;
		console.log(errorMessage);
	} else {
		errorMessage += "unknown";
		console.log(errorMessage);
	}
}

function cleanErrorStack(error: Error): string {
	if (error.stack === undefined) return "";

	// This cleans up the stack of a finding. The changes are independent of each other, since a finding can be
	// thrown from the hooking library, by the custom hooks, or by the fuzz target.
	if (error instanceof Finding) {
		// Remove the message from the stack trace. Also remove the subsequent line of the remaining stack trace that
		// always contains `reportFinding()`, which is not relevant for the user.
		error.stack = error.stack
			?.replace(`Error: ${error.message}\n`, "")
			.replace(/.*\n/, "");

		// Remove all lines up to and including the line that mentions the hooking library from the stack trace of a
		// finding.
		const stack = error.stack.split("\n");
		const index = stack.findIndex((line) =>
			line.includes("jazzer.js/packages/hooking/manager")
		);
		if (index !== undefined && index >= 0) {
			error.stack = stack.slice(index + 1).join("\n");
		}
	}

	const result: string[] = [];
	for (const line of error.stack.split("\n")) {
		if (line.includes("jazzer.js/packages/core/core.ts")) {
			break;
		}
		result.push(line);
	}
	return result.join("\n");
}

function buildFuzzerOptions(options: Options): string[] {
	if (!options || !options.fuzzerOptions) {
		return [];
	}

	let opts = options.fuzzerOptions;
	if (options.dryRun) {
		// the last provided option takes precedence
		opts = opts.concat("-runs=0");
	}

	if (options.timeout <= 0) {
		throw new Error("timeout must be > 0");
	}
	const inSeconds = Math.ceil(options.timeout / 1000);
	opts = opts.concat(`-timeout=${inSeconds}`);
	return [prepareLibFuzzerArg0(opts), ...opts];
}

async function loadFuzzFunction(options: Options): Promise<fuzzer.FuzzTarget> {
	const fuzzTarget = await importModule(options.fuzzTarget);
	if (!fuzzTarget) {
		throw new Error(
			`${options.fuzzTarget} could not be imported successfully"`
		);
	}
	const fuzzFn: fuzzer.FuzzTarget = fuzzTarget[options.fuzzEntryPoint];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${options.fuzzTarget} does not export function "${options.fuzzEntryPoint}"`
		);
	}
	return wrapFuzzFunctionForBugDetection(fuzzFn);
}

/**
 * Wraps the given fuzz target function to handle errors from both the fuzz target and bug detectors.
 * Ensures that errors thrown by bug detectors have higher priority than errors in the fuzz target.
 */
export function wrapFuzzFunctionForBugDetection(
	originalFuzzFn: fuzzer.FuzzTarget
): fuzzer.FuzzTarget {
	if (originalFuzzFn.length === 1) {
		return (data: Buffer): void | Promise<void> => {
			let fuzzTargetError: unknown;
			let result: void | Promise<void>;
			try {
				result = (originalFuzzFn as fuzzer.FuzzTargetAsyncOrValue)(data);
				// Explicitly set promise handlers to process findings, but still return
				// the fuzz target result directly, so that sync execution is still
				// possible.
				if (result instanceof Promise) {
					result = result.then(
						(result) => {
							return throwIfError() ?? result;
						},
						(reason) => {
							return throwIfError(reason);
						}
					);
				}
			} catch (e) {
				fuzzTargetError = e;
			}
			return throwIfError(fuzzTargetError) ?? result;
		};
	} else {
		return (
			data: Buffer,
			done: (err?: Error) => void
		): void | Promise<void> => {
			try {
				// Return result of fuzz target to enable sanity checks in C++ part.
				return originalFuzzFn(data, (err?: Error) => {
					const finding = getFirstFinding();
					if (finding !== undefined) {
						clearFirstFinding();
					}
					done(finding ?? err);
				});
			} catch (e) {
				throwIfError(e);
			}
		};
	}
}

function throwIfError(fuzzTargetError?: unknown) {
	const error = getFirstFinding();
	if (error !== undefined) {
		// The `firstFinding` is a global variable: we need to clear it after each fuzzing iteration.
		clearFirstFinding();
		throw error;
	} else if (fuzzTargetError) {
		throw fuzzTargetError;
	}
	return undefined;
}

async function importModule(name: string): Promise<FuzzModule | void> {
	return import(name);
}

export function ensureFilepath(filePath: string): string {
	if (!filePath) {
		throw Error("Empty filepath provided");
	}

	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);

	// file: schema is required on Windows
	const fullPath = "file://" + absolutePath;
	return [".js", ".mjs", ".cjs"].some((suffix) => fullPath.endsWith(suffix))
		? fullPath
		: fullPath + ".js";
}

export type { Jazzer } from "./jazzer";
export { jazzer } from "./jazzer";
export { FuzzedDataProvider } from "./FuzzedDataProvider";
