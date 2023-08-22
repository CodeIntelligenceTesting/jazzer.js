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

import { Circus, Global } from "@jest/types";
import {
	FuzzTarget,
	FuzzTargetAsyncOrValue,
	FuzzTargetCallback,
} from "@jazzer.js/fuzzer";
import { TIMEOUT_PLACEHOLDER } from "./config";
import { Corpus } from "./corpus";
import * as fs from "fs";
import { removeTopFramesFromError } from "./errorUtils";
import {
	Options,
	defaultOptions,
	startFuzzingNoInit,
	wrapFuzzFunctionForBugDetection,
} from "@jazzer.js/core";

// Indicate that something went wrong executing the fuzzer.
export class FuzzerError extends Error {}

export type FuzzTest = (
	name: Global.TestNameLike,
	fn: FuzzTarget,
	timeout?: number,
) => void;

export const skip: (globals: Global.Global) => FuzzTest =
	(globals: Global.Global) => (name) => {
		globals.test.skip(toTestName(name), () => {
			return;
		});
	};

type fuzz = (
	globals: Global.Global,
	testFile: string,
	fuzzingConfig: Options,
	currentTestState: () => Circus.DescribeBlock | undefined,
	currentTestTimeout: () => number | undefined,
	originalTestNamePattern: () => RegExp | undefined,
) => FuzzTest;

export const fuzz: fuzz = (
	globals,
	testFile,
	fuzzingConfig,
	currentTestState,
	currentTestTimeout,
	originalTestNamePattern,
) => {
	return (name, fn, timeout) => {
		const state = currentTestState();
		if (!state) {
			throw new Error("No test state found");
		}

		// Add all tests that don't match the test name pattern as skipped.
		const testStatePath = currentTestStatePath(toTestName(name), state);
		const testNamePattern = originalTestNamePattern();
		if (
			testStatePath !== undefined &&
			testNamePattern != undefined &&
			!testNamePattern.test(testStatePath.join(" "))
		) {
			globals.describe.skip(name, () => {});
			return;
		}

		const corpus = new Corpus(testFile, testStatePath);

		// Timeout priority is:
		// 1. Use timeout directly defined in test function
		// 2. Use timeout defined in fuzzing config
		// 3. Use jest timeout
		if (timeout != undefined) {
			fuzzingConfig.timeout = timeout;
		} else {
			const jestTimeout = currentTestTimeout();
			if (jestTimeout != undefined && fuzzingConfig.timeout == undefined) {
				fuzzingConfig.timeout = jestTimeout;
			} else if (fuzzingConfig.timeout === TIMEOUT_PLACEHOLDER) {
				fuzzingConfig.timeout = defaultOptions.timeout;
			}
		}

		const wrappedFn = wrapFuzzFunctionForBugDetection(fn);

		if (fuzzingConfig.mode === "regression") {
			runInRegressionMode(
				name,
				wrappedFn,
				corpus,
				fuzzingConfig,
				globals,
				originalTestNamePattern(),
			);
		} else if (fuzzingConfig.mode === "fuzzing") {
			runInFuzzingMode(name, wrappedFn, corpus, fuzzingConfig, globals);
		} else {
			throw new Error(`Unknown mode ${fuzzingConfig.mode}`);
		}
	};
};

export const runInFuzzingMode = (
	name: Global.TestNameLike,
	fn: FuzzTarget,
	corpus: Corpus,
	options: Options,
	globals: Global.Global,
) => {
	globals.test(name, () => {
		options.fuzzerOptions.unshift(corpus.seedInputsDirectory);
		options.fuzzerOptions.unshift(corpus.generatedInputsDirectory);
		options.fuzzerOptions.push(
			"-artifact_prefix=" + corpus.seedInputsDirectory,
		);
		return startFuzzingNoInit(fn, options);
	});
};

export const runInRegressionMode = (
	name: Global.TestNameLike,
	fn: FuzzTarget,
	corpus: Corpus,
	options: Options,
	globals: Global.Global,
	originalTestNamePattern: RegExp | undefined,
) => {
	globals.describe(name, () => {
		function executeTarget(content: Buffer) {
			let timeoutID: NodeJS.Timeout;
			return new Promise((resolve, reject) => {
				// Register a timeout for every fuzz test function invocation.
				timeoutID = setTimeout(() => {
					reject(new FuzzerError(`Timeout reached ${options.timeout}`));
				}, options.timeout);

				// Fuzz test expects a done callback, if more than one parameter is specified.
				if (fn.length > 1) {
					return doneCallbackPromise(fn, content, resolve, reject);
				} else {
					// Support sync and async fuzz tests.
					return Promise.resolve()
						.then(() => (fn as FuzzTargetAsyncOrValue)(content))
						.then(resolve, reject);
				}
			}).then(
				(value: unknown) => {
					// Remove timeout to enable clean shutdown.
					timeoutID?.unref?.();
					clearTimeout(timeoutID);
					return value;
				},
				(error: unknown) => {
					// Remove timeout to enable clean shutdown.
					timeoutID?.unref?.();
					clearTimeout(timeoutID);
					throw error;
				},
			);
		}

		// Always execute target function with an empty buffer.
		globals.test(
			"<empty>",
			async () => executeTarget(Buffer.from("")),
			options.timeout,
		);

		// Execute the fuzz test with each input file as no libFuzzer is required.
		corpus.inputsPaths().forEach(([seed, path]) => {
			globals.test(
				seed,
				async () => executeTarget(await fs.promises.readFile(path)),
				options.timeout,
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
