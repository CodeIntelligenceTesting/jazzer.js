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

import * as fs from "fs";
import path from "path";

import * as libCoverage from "istanbul-lib-coverage";
import * as libReport from "istanbul-lib-report";
import * as reports from "istanbul-reports";
import * as tmp from "tmp";

import * as fuzzer from "@jazzer.js/fuzzer";
import * as hooking from "@jazzer.js/hooking";
import {
	FileSyncIdStrategy,
	Instrumentor,
	MemorySyncIdStrategy,
	registerInstrumentor,
} from "@jazzer.js/instrumentor";

import { getCallbacks } from "./callback";
import {
	cleanErrorStack,
	clearFirstFinding,
	errorName,
	FuzzerSignalFinding,
	printFinding,
	reportFinding,
} from "./finding";
import { jazzerJs } from "./globals";
import { buildFuzzerOption, Options } from "./options";
import { ensureFilepath, importModule } from "./utils";

// Remove temporary files on exit
tmp.setGracefulCleanup();

// Possible fuzzing exit codes. libFuzzer uses exit code 77 in case of a crash,
// use the same one for uncaught exceptions and bug detector findings.
export enum FuzzingExitCode {
	// Fuzzer exited normally without finding.
	Ok = 0,
	// libFuzzers crash exit code.
	Finding = 77,
	// Unexpected or missing finding.
	UnexpectedError = 78,
}

// Enforce usage of fuzz targets wrapped with the branded type "FindingAwareFuzzTarget" in core functions.
export type FindingAwareFuzzTarget = fuzzer.FuzzTarget & {
	__brand: "FindingAwareFuzzTarget";
};

export class FuzzingResult {
	constructor(
		public readonly returnCode: FuzzingExitCode,
		public readonly error?: unknown,
	) {}
}

/* eslint no-var: 0 */
declare global {
	var Fuzzer: fuzzer.Fuzzer;
	var HookManager: hooking.HookManager;
	var __coverage__: libCoverage.CoverageMapData;
	var options: Options;
}

export async function initFuzzing(options: Options): Promise<Instrumentor> {
	const instrumentor = new Instrumentor(
		options.includes,
		options.excludes,
		options.customHooks,
		options.coverage,
		options.dryRun,
		options.idSyncFile
			? new FileSyncIdStrategy(options.idSyncFile)
			: new MemorySyncIdStrategy(),
	);
	registerInstrumentor(instrumentor);

	// Dynamic import works only with javascript files, so we have to manually specify the directory with the
	// transpiled bug detector files.
	const possibleBugDetectorFiles = getFilteredBugDetectorPaths(
		path.join(__dirname, "../../bug-detectors/dist/internal"),
		options.disableBugDetectors,
	);

	if (process.env.JAZZER_DEBUG) {
		console.error(
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

	return instrumentor;
}

export function registerGlobals(
	options: Options,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	globals: any[] = [globalThis],
) {
	globals.forEach((global) => {
		global.Fuzzer = fuzzer.fuzzer;
		global.HookManager = hooking.hookManager;
		global.options = options;
		global.JazzerJS = jazzerJs;
	});
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
					console.error(
						`Skip loading bug detector "${bugDetectorName}" because of user-provided pattern.`,
					);
				}
				return !shouldDisable;
			})
			// Get absolute paths for each bug detector.
			.map((file) => path.join(bugDetectorsDirectory, file))
	);
}

export async function startFuzzing(options: Options): Promise<FuzzingResult> {
	registerGlobals(options);
	await initFuzzing(options);
	const fuzzFn = await loadFuzzFunction(options);
	const findingAwareFuzzFn = asFindingAwareFuzzFn(fuzzFn);
	return startFuzzingNoInit(findingAwareFuzzFn, options).finally(() => {
		// These post fuzzing actions are only required for invocations through the CLI,
		// other means of invocation, e.g. via Jest, don't need them.
		fuzzer.fuzzer.printReturnInfo(options.sync);
		processCoverage(options.coverageDirectory, options.coverageReporters);
	});
}

export async function startFuzzingNoInit(
	fuzzFn: FindingAwareFuzzTarget,
	options: Options,
): Promise<FuzzingResult> {
	// Signal handler that stops fuzzing when the process receives a signal.
	// The signal is raised as a finding and orderly shuts down the fuzzer, as that's
	// necessary to generate coverage reports and print debug information.
	// Currently only SIGINT is handled this way, as SIGSEGV has to be handled
	// by the native addon and directly stops the process.
	const signalHandler = (signal: number): void => {
		reportFinding(new FuzzerSignalFinding(signal), false);
	};
	process.on("SIGINT", () => signalHandler(0));

	try {
		const fuzzerOptions = buildFuzzerOption(options);
		if (options.sync) {
			await fuzzer.fuzzer.startFuzzing(
				fuzzFn,
				fuzzerOptions,
				// In synchronous mode, we cannot use the SIGINT handler in Node,
				// because the event loop is blocked by the fuzzer, and the handler
				// won't be called until the fuzzing process is finished.
				// Hence, we pass a callback function to the native fuzzer and
				// register a SIGINT handler there.
				signalHandler,
			);
		} else {
			await fuzzer.fuzzer.startFuzzingAsync(fuzzFn, fuzzerOptions);
		}
		// Fuzzing ended without a finding, due to -max_total_time or -runs.
		return reportFuzzingResult(undefined, options.expectedErrors);
	} catch (e: unknown) {
		// Fuzzing produced an error, e.g. unhandled exception or bug detector finding.
		return reportFuzzingResult(e, options.expectedErrors);
	}
}

function reportFuzzingResult(
	error: unknown,
	expectedErrors: string[],
): FuzzingResult {
	if (process.env.JAZZER_DEBUG) {
		hooking.hookTracker.categorizeUnknown(HookManager.hooks).print();
	}

	// No error found, check if one is expected.
	if (!error) {
		if (expectedErrors.length) {
			const message = `ERROR: Received no error, but expected one of [${expectedErrors}].`;
			console.error(message);
			return new FuzzingResult(
				FuzzingExitCode.UnexpectedError,
				new Error(message),
			);
		}
		// No error found and none expected, everything is fine.
		return new FuzzingResult(FuzzingExitCode.Ok);
	}

	// Error found and expected, check if it's one of the expected ones.
	if (expectedErrors.length) {
		const name = errorName(error);
		if (expectedErrors.includes(name)) {
			console.error(`INFO: Received expected error "${name}".`);
			return new FuzzingResult(FuzzingExitCode.Ok, error);
		} else {
			console.error(
				`ERROR: Received error "${name}" is not in expected errors [${expectedErrors}].`,
			);
			return new FuzzingResult(FuzzingExitCode.UnexpectedError, error);
		}
	}

	// Check if signal finding was reported, which might result in a normal termination.
	if (
		error instanceof FuzzerSignalFinding &&
		error.exitCode === FuzzingExitCode.Ok
	) {
		return new FuzzingResult(FuzzingExitCode.Ok);
	}

	// Error found, but no specific one expected.
	return new FuzzingResult(FuzzingExitCode.Finding, error);
}

function processCoverage(
	coverageDirectory: string,
	coverageReporters: string[],
) {
	// Generate a coverage report in fuzzing mode (non-jest). The coverage report for the jest-runner is generated
	// by jest internally (as long as '--coverage' is set).
	if (global.__coverage__) {
		const coverageMap = libCoverage.createCoverageMap(global.__coverage__);
		const context = libReport.createContext({
			dir: coverageDirectory,
			watermarks: {},
			coverageMap: coverageMap,
		});
		coverageReporters.forEach((reporter) =>
			reports.create(reporter as keyof reports.ReportOptions).execute(context),
		);
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
	return fuzzFn;
}

/**
 * Wraps the given fuzz target function to handle errors from both the fuzz target and bug detectors.
 * Ensures that errors thrown by bug detectors have higher priority than errors in the fuzz target.
 */
export function asFindingAwareFuzzFn(
	originalFuzzFn: fuzzer.FuzzTarget,
	dumpCrashingInput = true,
): FindingAwareFuzzTarget {
	function printAndDump(error: unknown): void {
		cleanErrorStack(error);
		if (
			!(
				error instanceof FuzzerSignalFinding &&
				error.exitCode === FuzzingExitCode.Ok
			)
		) {
			printFinding(error);
			if (dumpCrashingInput) {
				fuzzer.fuzzer.printAndDumpCrashingInput();
			}
		}
	}

	function throwIfError(fuzzTargetError?: unknown): undefined | never {
		const error = clearFirstFinding() ?? fuzzTargetError;
		if (error) {
			printAndDump(error);
			throw error;
		}
	}

	if (originalFuzzFn.length === 1) {
		return ((data: Buffer): unknown | Promise<unknown> => {
			function isPromiseLike<T>(arg: unknown): arg is Promise<T> {
				return !!arg && (arg as Promise<T>).then !== undefined;
			}
			let fuzzTargetError: unknown;
			let result: unknown | Promise<unknown> = undefined;
			const callbacks = getCallbacks();
			try {
				callbacks.runBeforeEachCallbacks();
				result = (originalFuzzFn as fuzzer.FuzzTargetAsyncOrValue)(data);
				// Explicitly set promise handlers to process findings, but still return
				// the fuzz target result directly, so that sync execution is still
				// possible.
				if (isPromiseLike(result)) {
					result = result.then(
						(result) => {
							callbacks.runAfterEachCallbacks();
							return throwIfError() ?? result;
						},
						(reason) => {
							callbacks.runAfterEachCallbacks();
							return throwIfError(reason);
						},
					);
				} else {
					callbacks.runAfterEachCallbacks();
				}
			} catch (e) {
				callbacks.runAfterEachCallbacks();
				fuzzTargetError = e;
			}
			return throwIfError(fuzzTargetError) ?? result;
		}) as FindingAwareFuzzTarget;
	} else {
		return ((
			data: Buffer,
			done: (err?: Error) => void,
		): unknown | Promise<unknown> => {
			const callbacks = getCallbacks();
			try {
				callbacks.runBeforeEachCallbacks();
				// Return result of fuzz target to enable sanity checks in C++ part.
				const result = originalFuzzFn(data, (err?) => {
					const error = clearFirstFinding() ?? err;
					if (error) {
						printAndDump(error);
					}
					callbacks.runAfterEachCallbacks();
					done(error);
				});
				// Check if any finding was reported by the invocation before the
				// callback was executed. As the callback in used for control flow,
				// don't run afterEach here.
				return throwIfError() ?? result;
			} catch (e) {
				callbacks.runAfterEachCallbacks();
				throwIfError(e);
			}
		}) as FindingAwareFuzzTarget;
	}
}

// Export public API from within core module for easy access.
export * from "./api";
export { FuzzedDataProvider } from "./FuzzedDataProvider";
export {
	buildOptions,
	defaultOptions,
	Options,
	ParameterResolverIndex,
	setParameterResolverValue,
} from "./options";
