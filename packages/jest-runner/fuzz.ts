/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import * as fs from "fs";

import { Circus, Global } from "@jest/types";

import {
	AllowedFuzzTestOptions,
	asFindingAwareFuzzFn,
	FindingAwareFuzzTarget,
	FuzzTarget,
	FuzzTargetAsyncOrValue,
	FuzzTargetCallback,
	Options,
	OptionsManager,
	OptionSource,
	printOptions,
	startFuzzingNoInit,
} from "@jazzer.js/core";

import { Corpus } from "./corpus";
import { removeTopFramesFromError } from "./errorUtils";

// Indicate that something went wrong executing the fuzzer.
export class FuzzerError extends Error {}

export type FuzzTest = (
	name: Global.TestNameLike,
	fn: FuzzTarget,
	timeoutOrOptions?: number | Partial<Pick<Options, AllowedFuzzTestOptions>>,
) => void;

export const skip: (globals: Global.Global) => FuzzTest =
	(globals: Global.Global) => (name) => {
		globals.test.skip(toTestName(name), () => {
			return;
		});
	};

export type JestTestMode = "skip" | "only" | "standard";

function printTestNameIfRequested(testStatePath: string[]) {
	const full_name: string = testStatePath.join(" ");
	if (process.env.JAZZER_LIST_FUZZTEST_NAMES) {
		if (
			process.env.JAZZER_LIST_FUZZTEST_NAMES_PATTERN == undefined ||
			full_name.match(process.env.JAZZER_LIST_FUZZTEST_NAMES_PATTERN)
		) {
			if (process.env.JAZZER_LIST_FUZZTEST_NAMES == "short") {
				const short_name: string = testStatePath.pop() || "";
				console.log(short_name);
			} else if (process.env.JAZZER_LIST_FUZZTEST_NAMES == "split") {
				const split_name: string = testStatePath.join(" / ");
				console.log(split_name);
			} else {
				console.log(full_name);
			}
		}
	}
}

export function fuzz(
	globals: Global.Global,
	testFile: string,
	fuzzingConfig: OptionsManager,
	currentTestState: () => Circus.DescribeBlock | undefined,
	currentTestTimeout: () => number | undefined,
	originalTestNamePattern: () => RegExp | undefined,
	mode: JestTestMode,
): FuzzTest {
	return (name, fn, timeoutOrOptions) => {
		// Deep clone the fuzzing config, so that each test can modify it without
		// affecting other tests, e.g. set a test specific timeout.
		const localConfig = fuzzingConfig.clone();

		if (currentTestTimeout()) {
			localConfig.merge(
				{ timeout: currentTestTimeout() },
				OptionSource.InternalJestTimeout,
			);
		}

		let paramsToMerge: Partial<Options> = {};

		if (typeof timeoutOrOptions === "number") {
			paramsToMerge = { timeout: timeoutOrOptions };
		} else if (typeof timeoutOrOptions === "object") {
			paramsToMerge = timeoutOrOptions;
		} else if (timeoutOrOptions !== undefined) {
			throw new FuzzerError(
				`Invalid timeout or options argument "${timeoutOrOptions}"`,
			);
		}

		localConfig.merge(paramsToMerge, OptionSource.JestFuzzTestOptions);

		const state = currentTestState();
		if (!state) {
			throw new Error("No test state found");
		}

		// Add tests that don't match the test name pattern as skipped, so that
		// only the requested tests are executed.
		const testStatePath = currentTestStatePath(toTestName(name), state);
		const testNamePattern = originalTestNamePattern();

		printTestNameIfRequested(testStatePath);

		const skip =
			testStatePath !== undefined &&
			testNamePattern !== undefined &&
			!testNamePattern.test(testStatePath.join(" "));
		if (skip) {
			globals.test.skip(name, () => {
				// Ignore
			});
			return;
		}

		const corpus = new Corpus(
			testFile,
			testStatePath,
			localConfig.get("coverage"),
		);

		const wrappedFn = asFindingAwareFuzzFn(
			fn,
			localConfig.get("mode") === "fuzzing",
		);

		if (localConfig.get("mode") === "regression") {
			runInRegressionMode(name, wrappedFn, corpus, localConfig, globals, mode);
		} else if (localConfig.get("mode") === "fuzzing") {
			runInFuzzingMode(name, wrappedFn, corpus, localConfig, globals, mode);
		} else {
			throw new Error(`Unknown mode ${localConfig.get("mode")}`);
		}
	};
}

export const runInFuzzingMode = (
	name: Global.TestNameLike,
	fn: FindingAwareFuzzTarget,
	corpus: Corpus,
	options: OptionsManager,
	globals: Global.Global,
	mode: JestTestMode,
) => {
	handleMode(mode, globals.test)(name, async () => {
		const newOptions = options.clone();
		const fuzzerOptions = newOptions.get("fuzzerOptions");
		fuzzerOptions.unshift(corpus.seedInputsDirectory);
		fuzzerOptions.unshift(corpus.generatedInputsDirectory);
		fuzzerOptions.push("-artifact_prefix=" + corpus.seedInputsDirectory);
		return startFuzzingNoInit(fn, newOptions).then(({ error }) => {
			// Throw the found error to mark the test as failed.
			if (error) throw error;
		});
	});
};

export const runInRegressionMode = (
	name: Global.TestNameLike,
	fn: FindingAwareFuzzTarget,
	corpus: Corpus,
	options: OptionsManager,
	globals: Global.Global,
	mode: JestTestMode,
) => {
	printOptions(options, `for test "${name}"`);

	handleMode(mode, globals.describe)(name, () => {
		function executeTarget(content: Buffer) {
			return new Promise((resolve, reject) => {
				// Fuzz test expects a done callback, if more than one parameter is specified.
				if (fn.length > 1) {
					doneCallbackPromise(fn, content, resolve, reject);
				} else {
					// Support sync and async fuzz tests.
					Promise.resolve()
						.then(() => (fn as FuzzTargetAsyncOrValue)(content))
						.then(resolve, reject);
				}
			});
		}

		// Always execute target function with an empty buffer.
		globals.test(
			"<empty>",
			async () => executeTarget(Buffer.from("")),
			options.get("timeout"),
		);

		// Execute the fuzz test with each input file as no libFuzzer is required.
		corpus.inputsPaths().forEach(([seed, path]) => {
			globals.test(
				seed,
				async () => executeTarget(await fs.promises.readFile(path)),
				options.get("timeout"),
			);
		});
	});
};

const doneCallbackPromise = (
	fn: FuzzTargetCallback,
	content: Buffer,
	resolve: (value: unknown) => void,
	reject: (reason?: unknown) => void,
) => {
	try {
		let doneCalled = false;
		const doneCallback = (e?: unknown) => {
			if (doneCalled) {
				// As the promise was already resolved in the last invocation, and
				// there could be quite some time until this one, there is not much we
				// can do besides printing an error message.
				console.error(
					"ERROR: Expected done to be called once, but it was called multiple times.",
				);
			}
			doneCalled = true;
			let error;
			if (typeof e === "string") {
				error = removeTopFramesFromError(new Error(e), 1);
			} else {
				error = e;
			}
			error ? reject(error) : resolve(undefined);
		};
		const result = fn(content, doneCallback);
		// Expecting a done callback, but returning a promise, is invalid. This is
		// already prevented by TypeScript, but we should still check for this
		// situation due to untyped JavaScript fuzz tests.
		// Ignore other return values, as they are not relevant for the fuzz test.
		// @ts-ignore
		if (result && typeof result.then === "function") {
			reject(
				new FuzzerError(
					"Either async or done callback based fuzz tests allowed",
				),
			);
		}
	} catch (e: unknown) {
		reject(e);
	}
};

function handleMode(
	mode: JestTestMode,
	test: Global.ItConcurrent | Global.Describe,
) {
	switch (mode) {
		case "skip":
			return test.skip;
		case "only":
			return test.only;
	}
	return test;
}

const toTestName = (name: Global.TestNameLike): string => {
	switch (typeof name) {
		case "string":
			return name;
		case "number":
			return `${name}`;
		case "function":
			if (name.name) {
				return name.name;
			}
	}
	throw new FuzzerError(`Invalid test name "${name}"`);
};

const currentTestStatePath = (
	name: string,
	state: Circus.DescribeBlock,
): string[] => {
	const elements = [name];
	let describeBlock = state;
	while (describeBlock.parent) {
		elements.unshift(describeBlock.name);
		if (describeBlock.parent) {
			describeBlock = describeBlock.parent;
		}
	}
	return elements;
};
