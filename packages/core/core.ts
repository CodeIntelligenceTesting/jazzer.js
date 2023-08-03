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
	getFirstFinding,
	printFinding,
	Finding,
} from "./finding";
import {
	FileSyncIdStrategy,
	Instrumentor,
	MemorySyncIdStrategy,
	registerInstrumentor,
} from "@jazzer.js/instrumentor";
import { callbacks } from "./callback";
import { ensureFilepath, importModule } from "./utils";
import { buildFuzzerOption } from "./options";

// Remove temporary files on exit
tmp.setGracefulCleanup();

// libFuzzer uses exit code 77 in case of a crash, so use a similar one for
// failed error expectations.
const ERROR_EXPECTED_CODE = 0;
const ERROR_UNEXPECTED_CODE = 78;

const SIGSEGV = 11;

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

	await hooking.hookManager.finalizeHooks();
}

function registerGlobals(options: Options) {
	globalThis.Fuzzer = fuzzer.fuzzer;
	globalThis.HookManager = hooking.hookManager;
	globalThis.options = options;
}

// Filters out disabled bug detectors and prepares all the others for dynamic import.
// This functionality belongs to the bug-detector module but no dependency from
// core to bug-detectors is allowed.
function getFilteredBugDetectorPaths(
	bugDetectorsDirectory: string,
	disableBugDetectors: string[],
): string[] {
	const disablePatterns = disableBugDetectors.map(
		(pattern: string) => new RegExp(pattern),
	);
	return (
		fs
			.readdirSync(bugDetectorsDirectory)
			// The compiled "internal" directory contains several files such as .js.map and .d.ts.
			// We only need the .js files.
			// Here we also filter out bug detectors that should be disabled.
			.filter((bugDetectorPath) => {
				if (!bugDetectorPath.endsWith(".js")) {
					return false;
				}

				// Dynamic imports need .js files.
				const bugDetectorName = path.basename(bugDetectorPath, ".js");

				// Checks in the global options if the bug detector should be loaded.
				const shouldDisable = disablePatterns.some((pattern) =>
					pattern.test(bugDetectorName),
				);

				if (shouldDisable) {
					console.log(
						`Skip loading bug detector "${bugDetectorName}" because of user-provided pattern.`,
					);
				}
				return !shouldDisable;
			})
			// Get absolute paths for each bug detector.
			.map((file) => path.join(bugDetectorsDirectory, file))
	);
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

export async function startFuzzingNoInit(
	fuzzFn: fuzzer.FuzzTarget,
	options: Options,
) {
	// Signal handler that stops fuzzing when the process receives a SIGINT/SIGSEGV,
	// necessary to generate coverage reports and print debug information.
	// The handler stops the process via `stopFuzzing`, as resolving the "fuzzing
	// promise" does not work in sync mode due to the blocked event loop.
	const signalHandler = (exitCode: number) => {
		stopFuzzing(
			undefined,
			options.expectedErrors,
			options.coverageDirectory,
			options.coverageReporters,
			options.sync,
			exitCode,
		);
	};

	const fuzzerOptions = buildFuzzerOption(options);

	if (options.sync) {
		return Promise.resolve().then(() =>
			Fuzzer.startFuzzing(
				fuzzFn,
				fuzzerOptions,
				// In synchronous mode, we cannot use the SIGINT/SIGSEGV handler in Node,
				// because it won't be called until the fuzzing process is finished.
				// Hence, we pass a callback function to the native fuzzer.
				// The appropriate exitCode for the signalHandler will be added by the native fuzzer.
				signalHandler,
			),
		);
	} else {
		process.on("SIGINT", () => signalHandler(0));
		process.on("SIGSEGV", () => signalHandler(SIGSEGV));
		return Fuzzer.startFuzzingAsync(fuzzFn, fuzzerOptions);
	}
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

	// Prioritize findings over segfaults.
	if (forceShutdownWithCode === SIGSEGV && !(err instanceof Finding)) {
		err = new Finding("Segmentation Fault");
	}

	// No error found, check if one is expected or an exit code should be enforced.
	if (!err) {
		if (expectedErrors.length) {
			console.error(
				`ERROR: Received no error, but expected one of [${expectedErrors}].`,
			);
			stopFuzzing(ERROR_UNEXPECTED_CODE);
		} else {
			// No error received, no error expected.
			stopFuzzing(0);
		}
		return;
	}

	// Error found and expected, check if it's one of the expected ones.
	if (expectedErrors.length) {
		const name = errorName(err);
		if (expectedErrors.includes(name)) {
			console.log(`INFO: Received expected error "${name}".`);
			stopFuzzing(ERROR_EXPECTED_CODE);
		} else {
			printFinding(err);
			console.error(
				`ERROR: Received error "${name}" is not in expected errors [${expectedErrors}].`,
			);
			stopFuzzing(ERROR_UNEXPECTED_CODE);
		}
		return;
	}

	// Error found, but no specific one expected. This case is used for normal
	// fuzzing runs, so no dedicated exit code is given to the stop fuzzing function.
	printFinding(err);
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
	function throwIfError(fuzzTargetError?: unknown): undefined | never {
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

	if (originalFuzzFn.length === 1) {
		return (data: Buffer): void | Promise<void> => {
			let fuzzTargetError: unknown;
			let result: void | Promise<void> = undefined;
			try {
				callbacks.runBeforeEachCallbacks();
				result = (originalFuzzFn as fuzzer.FuzzTargetAsyncOrValue)(data);
				// Explicitly set promise handlers to process findings, but still return
				// the fuzz target result directly, so that sync execution is still
				// possible.
				if (result instanceof Promise) {
					result = result.then(
						(result) => {
							callbacks.runAfterEachCallbacks();
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
				callbacks.runAfterEachCallbacks();
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
				callbacks.runBeforeEachCallbacks();
				// Return result of fuzz target to enable sanity checks in C++ part.
				result = originalFuzzFn(data, (err?: Error) => {
					const finding = getFirstFinding();
					if (finding !== undefined) {
						clearFirstFinding();
					}
					callbacks.runAfterEachCallbacks();
					done(finding ?? err);
				});
			} catch (e) {
				callbacks.runAfterEachCallbacks();
				throwIfError(e);
			}
			return result;
		};
	}
}

// Export public API from within core module for easy access.
export * from "./api";
export { FuzzedDataProvider } from "./FuzzedDataProvider";
