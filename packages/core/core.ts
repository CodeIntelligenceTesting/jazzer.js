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
import { registerBugDetectors } from "@jazzer.js/bug-detectors";
import { trackedHooks } from "@jazzer.js/hooking";
import {
	registerInstrumentor,
	Instrumentor,
	FileSyncIdStrategy,
	MemorySyncIdStrategy,
} from "@jazzer.js/instrumentor";

// Remove temporary files on exit
tmp.setGracefulCleanup();

// libFuzzer uses exit code 77 in case of a crash, so use a similar one for
// failed error expectations.
const ERROR_EXPECTED_CODE = 0;
const ERROR_UNEXPECTED_CODE = 78;

// The first exception thrown by any bug detector will be stored here.
let bugDetectorException: Error | undefined;

function saveFirstBugDetectorException(
	e: Error,
	trimErrorStackLines = 0
): void {
	if (bugDetectorException) {
		return;
	}
	e.stack = e.stack
		?.replace(e.message, "")
		.split("\n")
		.slice(trimErrorStackLines)
		.join("\n");
	bugDetectorException = e;
}

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
	bugDetectors: string[];
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
	await registerBugDetectors(
		options.bugDetectors,
		saveFirstBugDetectorException
	);
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
	await Promise.all(options.customHooks.map(ensureFilepath).map(importModule));
}

export function forceStopFuzzing(err: unknown) {
	stopFuzzing(
		err,
		options.expectedErrors,
		options.coverageDirectory,
		options.coverageReporters,
		options.sync
	);
}

export function registerGlobals() {
	globalThis.Fuzzer = fuzzer.fuzzer;
	globalThis.HookManager = hooking.hookManager;
}

export async function startFuzzing(options: Options) {
	await initFuzzing(options);
	// Exceptions thrown by bug detectors should bypass all try-catch blocks in the fuzzing target;
	// and have higher priority than exceptions thrown by fuzz target.
	// To enable this, we wrap the fuzz target in a function that checks if any bug detector exception has been
	// thrown, and ensures that it is treated with higher priority.
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

export async function startFuzzingNoInit(
	fuzzFn: fuzzer.FuzzTarget,
	options: Options
) {
	const fuzzerOptions = buildFuzzerOptions(options);
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
		trackedHooks.categorizeUnknown(HookManager.hooks).print();
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
	let errorMessage = `==${process.pid}== Uncaught Exception: Jazzer.js: `;
	if (error instanceof Error) {
		errorMessage += error.message;
		console.log(errorMessage);
		if (error.stack) {
			console.log(cleanStack(error.stack));
		}
	} else if (typeof error === "string" || error instanceof String) {
		errorMessage += error;
		console.log(errorMessage);
	} else {
		errorMessage += "unknown";
		console.log(errorMessage);
	}
}

function cleanStack(stack: string): string {
	const result: string[] = [];
	for (const line of stack.split("\n")) {
		if (line.includes("startFuzzing") && line.includes("jazzer.js")) {
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

// Reset the bug detector exception when it should be thrown.
// This is useful in regression tests using Jest, or when the fuzzer should continue running after finding a bug.
function throwBugDetectorExceptionAndReset() {
	const e = bugDetectorException;
	bugDetectorException = undefined;
	throw e;
}

function handleExceptions(
	result: void | Promise<void>,
	bugDetectorException: Error | undefined,
	fuzzTargetException: Error | undefined
) {
	if (bugDetectorException !== undefined) {
		throwBugDetectorExceptionAndReset();
	} else if (fuzzTargetException !== undefined) {
		throw fuzzTargetException;
	}
	return result;
}

/**
 * Executes the given fuzz target function (with return value or Promise) and handles exceptions.
 * @param originalFuzzFn - The original fuzz target function with return value or Promise.
 * @param data - The input data for the fuzz target function.
 * @returns The result of the original fuzz target function, or void if an exception is thrown.
 */
function executeFuzzFn(
	originalFuzzFn: fuzzer.FuzzTargetAsyncOrValue,
	data: Buffer
): void | Promise<void> {
	let fuzzTargetException: Error | undefined;
	let result: void | Promise<void>;
	try {
		result = originalFuzzFn(data);
	} catch (e) {
		fuzzTargetException = e as Error;
	}
	return handleExceptions(result, bugDetectorException, fuzzTargetException);
}

/**
 * Executes the given fuzz target function (with a callback) and handles exceptions.
 * @param originalFuzzFn - The original fuzz target function with a callback.
 * @param data - The input data for the fuzz target function.
 * @param done - The callback function to be called upon completion of the fuzz target function.
 */
function executeFuzzFnCallback(
	originalFuzzFn: fuzzer.FuzzTargetCallback,
	data: Buffer,
	done: (err?: Error) => void
): void {
	let fuzzTargetException: Error | undefined;
	try {
		originalFuzzFn(data, done);
	} catch (e) {
		fuzzTargetException = e as Error;
	}
	handleExceptions(undefined, bugDetectorException, fuzzTargetException);
}

/**
 * Wraps the given fuzz target function to handle exceptions from both the fuzz target and bug detectors.
 * Ensures that exceptions thrown by bug detectors have higher priority than exceptions in the fuzz target.
 * @param originalFuzzFn - The original fuzz target function to be wrapped.
 * @returns A wrapped fuzz target function that handles exceptions from both the fuzz target and bug detectors.
 */
export function wrapFuzzFunctionForBugDetection(
	originalFuzzFn: fuzzer.FuzzTarget
): fuzzer.FuzzTarget {
	if (originalFuzzFn.length === 1) {
		return (data: Buffer): void | Promise<void> =>
			executeFuzzFn(originalFuzzFn as fuzzer.FuzzTargetAsyncOrValue, data);
	} else {
		return (data: Buffer, done: (err?: Error) => void): void =>
			executeFuzzFnCallback(
				originalFuzzFn as fuzzer.FuzzTargetCallback,
				data,
				done
			);
	}
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
