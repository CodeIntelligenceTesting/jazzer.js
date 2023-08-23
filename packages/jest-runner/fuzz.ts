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
		// Deep clone the fuzzing config, so that each test can modify it without
		// affecting other tests, e.g. set a test specific timeout.
		const localConfig = JSON.parse(JSON.stringify(fuzzingConfig));

		const state = currentTestState();
		if (!state) {
			throw new Error("No test state found");
		}

		// Add tests that don't match the test name pattern as skipped, so that
		// only the requested tests are executed.
		const testStatePath = currentTestStatePath(toTestName(name), state);
		const testNamePattern = originalTestNamePattern();
		const skip =
			testStatePath !== undefined &&
			testNamePattern != undefined &&
			!testNamePattern.test(testStatePath.join(" "));
		if (skip) {
			globals.test.skip(name, () => {
				// Ignore
			});
			return;
		}

		const corpus = new Corpus(testFile, testStatePath);

		// Timeout priority is:
		// 1. Use timeout directly defined in test function
		// 2. Use timeout defined in fuzzing config
		// 3. Use jest timeout
		if (timeout != undefined) {
			localConfig.timeout = timeout;
		} else {
			const jestTimeout = currentTestTimeout();
			if (jestTimeout != undefined && localConfig.timeout == undefined) {
				localConfig.timeout = jestTimeout;
			} else if (localConfig.timeout === TIMEOUT_PLACEHOLDER) {
				localConfig.timeout = defaultOptions.timeout;
			}
		}

		const wrappedFn = wrapFuzzFunctionForBugDetection(fn);

		if (localConfig.mode === "regression") {
			runInRegressionMode(name, wrappedFn, corpus, localConfig, globals);
		} else if (localConfig.mode === "fuzzing") {
			runInFuzzingMode(name, wrappedFn, corpus, localConfig, globals);
		} else {
			throw new Error(`Unknown mode ${localConfig.mode}`);
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
) => {
	globals.describe(name, () => {
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
