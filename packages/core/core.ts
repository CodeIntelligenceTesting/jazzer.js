/*
 * Copyright 2023 Code Intelligence GmbH
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
	getFilteredBugDetectorPaths,
	getFirstFinding,
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
	disableBugDetectors: string[];
	mode?: "fuzzing" | "regression";
	verbose?: boolean;
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

export async function initFuzzing(options: Options): Promise<void> {
	registerGlobals(options);

	registerInstrumentor(
		new Instrumentor(
			options.includes,
			options.excludes,
			options.customHooks,
			options.coverage,
			options.dryRun,
			options.idSyncFile !== undefined
				? new FileSyncIdStrategy(options.idSyncFile)
				: new MemorySyncIdStrategy(),
		),
	);

	// Dynamic import works only with javascript files, so we have to manually specify the directory with the
	// transpiled bug detector files.
	const possibleBugDetectorFiles = getFilteredBugDetectorPaths(
		path.join(__dirname, "../../bug-detectors/dist/internal"),
		options.disableBugDetectors,
	);

	if (process.env.JAZZER_DEBUG) {
		console.log(
			"INFO: [BugDetector] Loading bug detectors: \n   " +
				possibleBugDetectorFiles.join("\n   "),
		);
	}

	// Load bug detectors before loading custom hooks because some bug detectors can be configured in the
	// custom hooks file.
	await Promise.all(
		possibleBugDetectorFiles.map(ensureFilepath).map(importModule),
	);

	await Promise.all(options.customHooks.map(ensureFilepath).map(importModule));

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
							e,
					);
				}
			}
		}
	}
}

export function registerGlobals(options: Options) {
	globalThis.Fuzzer = fuzzer.fuzzer;
	globalThis.HookManager = hooking.hookManager;
	globalThis.options = options;
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
				options.sync,
			);
		},
		(err: unknown) => {
			stopFuzzing(
				err,
				options.expectedErrors,
				options.coverageDirectory,
				options.coverageReporters,
				options.sync,
			);
		},
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
	options: Options,
) {
	// Signal handler that stops fuzzing when the process receives a SIGINT,
	// necessary to generate coverage reports and print debug information.
	// The handler stops the process via `stopFuzzing`, as resolving the "fuzzing
	// promise" does not work in sync mode due to the blocked event loop.
	const signalHandler = () => {
		stopFuzzing(
			undefined,
			options.expectedErrors,
			options.coverageDirectory,
			options.coverageReporters,
			options.sync,
			0,
		);
	};

	const fuzzerOptions = buildFuzzerOptions(options);
	logInfoAboutFuzzerOptions(fuzzerOptions);
	// in verbose mode print the configuration
	if (process.env.JAZZER_DEBUG) {
		console.debug("DEBUG: [core] Jazzer.js initial arguments: ");
		console.debug(options);
		console.debug("DEBUG: [core] Jazzer.js actually used fuzzer arguments: ");
		console.debug(fuzzerOptions);
	}
	if (options.sync) {
		return Promise.resolve().then(() =>
			Fuzzer.startFuzzing(
				fuzzFn,
				fuzzerOptions,
				// In synchronous mode, we cannot use the SIGINT handler in Node,
				// because it won't be called until the fuzzing process is finished.
				// Hence, we pass a callback function to the native fuzzer.
				signalHandler,
			),
		);
	} else {
		// Add a Node SIGINT handler to stop fuzzing gracefully.
		process.on("SIGINT", signalHandler);
		return Fuzzer.startFuzzingAsync(fuzzFn, fuzzerOptions);
	}
}

function prepareLibFuzzerArg0(fuzzerOptions: string[]): string {
	// When we run in a libFuzzer mode that spawns subprocesses, we create a wrapper script
	// that can be used as libFuzzer's argv[0]. In the fork mode, the main libFuzzer process
	// uses argv[0] to spawn further processes that perform the actual fuzzing.
	const libFuzzerSpawnsProcess = fuzzerOptions.some(
		(flag) =>
			flag.startsWith("-fork=") ||
			flag.startsWith("-jobs=") ||
			flag.startsWith("-merge="),
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
		(arg) => arg !== "--" && fuzzerOptions.indexOf(arg) === -1,
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
	sync: boolean,
	forceShutdownWithCode?: number,
) {
	const stopFuzzing = sync ? Fuzzer.stopFuzzing : Fuzzer.stopFuzzingAsync;
	if (process.env.JAZZER_DEBUG) {
		hooking.hookTracker.categorizeUnknown(HookManager.hooks).print();
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
			reports.create(reporter).execute(context),
		);
	}

	// No error found, check if one is expected or an exit code should be enforced.
	if (!err) {
		if (expectedErrors.length) {
			console.error(
				`ERROR: Received no error, but expected one of [${expectedErrors}].`,
			);
			stopFuzzing(ERROR_UNEXPECTED_CODE);
		} else if (forceShutdownWithCode !== undefined) {
			stopFuzzing(forceShutdownWithCode);
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
				`ERROR: Received error "${name}" is not in expected errors [${expectedErrors}].`,
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
			line.includes("jazzer.js/packages/hooking/manager"),
		);
		if (index !== undefined && index >= 0) {
			error.stack = stack.slice(index + 1).join("\n");
		}

		// also delete all lines that mention "jazzer.js/packages/"
		error.stack = error.stack.replace(/.*jazzer.js\/packages\/.*\n/g, "");
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
	if (options.mode === "regression") {
		// the last provided option takes precedence
		opts = opts.concat("-runs=0");
	}

	if (options.timeout <= 0) {
		throw new Error("timeout must be > 0");
	}
	const inSeconds = Math.ceil(options.timeout / 1000);
	opts = opts.concat(`-timeout=${inSeconds}`);

	// libFuzzer has to ignore SIGINT and SIGTERM, as it interferes
	// with the Node.js signal handling.
	opts = opts.concat("-handle_int=0", "-handle_term=0");

	// Dictionary handling. This diverges from the libfuzzer behavior, which allows only one dictionary (the last one).
	// We merge all dictionaries into one and pass that to libfuzzer.
	let shouldUseDictionaries = false;
	const mergedDictionary = `.JazzerJs-merged-dictionaries`;
	let dictionary = "";

	// Extract dictionaries from bug detectors.
	for (const dict of hooking.hookManager.getDictionaries()) {
		// Make an empty dictionary file.
		if (!shouldUseDictionaries) {
			shouldUseDictionaries = true;
		}
		// Append the contents of dict to the .jazzer-merged-dictionaries file.
		dictionary = dictionary.concat(dict);
	}

	// Merge all dictionaries into one: .jazzer-all-dictionaries.
	for (const option of options.fuzzerOptions) {
		if (option.startsWith("-dict=")) {
			const dict = option.substring(6);
			// if the dictionary is the same as the merged dictionary, skip it.
			if (dict === mergedDictionary) {
				continue;
			}
			// Make an empty dictionary file.
			if (!shouldUseDictionaries) {
				shouldUseDictionaries = true;
			}

			// Preserve the file name in a comment before merging dictionary contents.
			dictionary = dictionary.concat(`\n# ${dict}:\n`);
			dictionary = dictionary.concat(fs.readFileSync(dict).toString());
			// Drop the dictionary from the list of options.
			opts = opts.filter((o) => o !== option);
		}
	}

	if (shouldUseDictionaries) {
		// Add a comment to the top of the dictionary file.
		dictionary =
			"# This file was automatically generated. Do not edit.\n" + dictionary;
		// Check if the merged dictionary already exists and has the same contents.
		if (fs.existsSync(mergedDictionary)) {
			const existingDictionary = fs.readFileSync(mergedDictionary).toString();
			// Overwrite only if the dictionary contents differ.
			if (existingDictionary !== dictionary) {
				fs.writeFileSync(mergedDictionary, dictionary);
			}
		} else {
			// Otherwise, create the file.
			fs.writeFileSync(mergedDictionary, dictionary);
		}
		opts = opts.concat(`-dict=${mergedDictionary}`);
	}

	return [prepareLibFuzzerArg0(opts), ...opts];
}

async function loadFuzzFunction(options: Options): Promise<fuzzer.FuzzTarget> {
	const fuzzTarget = await importModule(options.fuzzTarget);
	if (!fuzzTarget) {
		throw new Error(
			`${options.fuzzTarget} could not be imported successfully"`,
		);
	}
	const fuzzFn: fuzzer.FuzzTarget = fuzzTarget[options.fuzzEntryPoint];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${options.fuzzTarget} does not export function "${options.fuzzEntryPoint}"`,
		);
	}
	return wrapFuzzFunctionForBugDetection(fuzzFn);
}

/**
 * Wraps the given fuzz target function to handle errors from both the fuzz target and bug detectors.
 * Ensures that errors thrown by bug detectors have higher priority than errors in the fuzz target.
 */
export function wrapFuzzFunctionForBugDetection(
	originalFuzzFn: fuzzer.FuzzTarget,
): fuzzer.FuzzTarget {
	if (originalFuzzFn.length === 1) {
		return (data: Buffer): void | Promise<void> => {
			let fuzzTargetError: unknown;
			let result: void | Promise<void> = undefined;
			try {
				hooking.hookManager.runBeforeEachCallbacks();
				result = (originalFuzzFn as fuzzer.FuzzTargetAsyncOrValue)(data);
				// Explicitly set promise handlers to process findings, but still return
				// the fuzz target result directly, so that sync execution is still
				// possible.
				if (result instanceof Promise) {
					result = result.then(
						(result) => {
							hooking.hookManager.runAfterEachCallbacks();
							return throwIfError() ?? result;
						},
						(reason) => {
							return throwIfError(reason);
						},
					);
				}
			} catch (e) {
				fuzzTargetError = e;
			}
			// Promises are handled above, so we only need to handle sync results here.
			if (!(result instanceof Promise)) {
				hooking.hookManager.runAfterEachCallbacks();
			}
			return throwIfError(fuzzTargetError) ?? result;
		};
	} else {
		return (
			data: Buffer,
			done: (err?: Error) => void,
		): void | Promise<void> => {
			let result: void | Promise<void> = undefined;
			try {
				hooking.hookManager.runBeforeEachCallbacks();
				// Return result of fuzz target to enable sanity checks in C++ part.
				result = originalFuzzFn(data, (err?: Error) => {
					const finding = getFirstFinding();
					if (finding !== undefined) {
						clearFirstFinding();
					}
					hooking.hookManager.runAfterEachCallbacks();
					done(finding ?? err);
				});
			} catch (e) {
				hooking.hookManager.runAfterEachCallbacks();
				throwIfError(e);
			}
			return result;
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
