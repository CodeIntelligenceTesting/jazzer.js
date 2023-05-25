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

import { Global } from "@jest/types";
import {
	FuzzTarget,
	FuzzTargetAsyncOrValue,
	FuzzTargetCallback,
} from "@jazzer.js/fuzzer";
import { loadConfig } from "./config";
import { JazzerWorker } from "./worker";
import { Corpus } from "./corpus";
import * as circus from "jest-circus";
import * as fs from "fs";
import { removeTopFramesFromError } from "./errorUtils";
import {
	Options,
	startFuzzingNoInit,
	wrapFuzzFunctionForBugDetection,
} from "@jazzer.js/core";

// Globally track when the fuzzer is started in fuzzing mode.
let fuzzerStarted = false;

// Indicate that something went wrong executing the fuzzer.
export class FuzzerError extends Error {}

// Error indicating that the fuzzer was already started.
export class FuzzerStartError extends FuzzerError {}

// Use Jests global object definition.
const g = globalThis as unknown as Global.Global;

export type FuzzTest = (
	name: Global.TestNameLike,
	fn: FuzzTarget,
	timeout?: number,
) => void;

export const skip: FuzzTest = (name) => {
	g.test.skip(toTestName(name), () => {
		return;
	});
};

export const fuzz: FuzzTest = (name, fn, timeout) => {
	const testName = toTestName(name);

	// Request the current test file path from the worker to create appropriate
	// corpus directory hierarchies. It is set by the worker that imports the
	// actual test file and changes during execution of multiple test files.
	const testFile = JazzerWorker.currentTestPath;

	// Build up the names of test block elements (describe, test, it) pointing
	// to the currently executed fuzz function, based on the circus runner state.
	// The used state changes during test file import but, at this point,
	// points to the element containing the fuzz function.
	const testStatePath = currentTestStatePath(testName);

	const corpus = new Corpus(testFile, testStatePath);

	const fuzzingConfig = loadConfig();

	// Timeout priority is: test timeout > config timeout > default timeout.
	if (!timeout) {
		timeout = fuzzingConfig.timeout;
	} else {
		fuzzingConfig.timeout = timeout;
	}

	const wrappedFn = wrapFuzzFunctionForBugDetection(fn);

	if (fuzzingConfig.mode === "regression") {
		runInRegressionMode(name, wrappedFn, corpus, timeout);
	} else if (fuzzingConfig.mode === "fuzzing") {
		runInFuzzingMode(name, wrappedFn, corpus, fuzzingConfig);
	} else {
		throw new Error(`Unknown mode ${fuzzingConfig.mode}`);
	}
};

export const runInFuzzingMode = (
	name: Global.TestNameLike,
	fn: FuzzTarget,
	corpus: Corpus,
	config: Options,
) => {
	config.fuzzerOptions.unshift(corpus.seedInputsDirectory);
	config.fuzzerOptions.unshift(corpus.generatedInputsDirectory);
	config.fuzzerOptions.push("-artifact_prefix=" + corpus.seedInputsDirectory);
	g.test(name, () => {
		// Fuzzing is only allowed to start once in a single nodejs instance.
		if (fuzzerStarted) {
			const message = `Fuzzer already started. Please provide single fuzz test using --testNamePattern. Skipping test "${toTestName(
				name,
			)}"`;
			const error = new FuzzerStartError(message);
			// Remove stack trace as it is shown in the CLI / IDE and points to internal code.
			error.stack = undefined;
			throw error;
		}
		fuzzerStarted = true;
		return startFuzzingNoInit(fn, config);
	});
};

export const runInRegressionMode = (
	name: Global.TestNameLike,
	fn: FuzzTarget,
	corpus: Corpus,
	timeout: number,
) => {
	g.describe(name, () => {
		const inputsPaths = corpus.inputsPaths();

		// Mark fuzz tests with empty inputs as skipped to suppress Jest error.
		if (inputsPaths.length === 0) {
			g.test.skip(name, () => {
				return;
			});
			return;
		}

		// Execute the fuzz test with each input file as no libFuzzer is required.
		// Custom hooks are already registered via the jest-runner.
		inputsPaths.forEach(([seed, path]) => {
			g.test(seed, async () => {
				const content = await fs.promises.readFile(path);
				let timeoutID: NodeJS.Timeout;
				return new Promise((resolve, reject) => {
					// Register a timeout for every fuzz test function invocation.
					timeoutID = setTimeout(() => {
						reject(new FuzzerError(`Timeout reached ${timeout}`));
					}, timeout);

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
			});
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
					"Expected done to be called once, but it was called multiple times.",
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

const currentTestStatePath = (testName: string): string[] => {
	const elements = [testName];
	let describeBlock = circus.getState().currentDescribeBlock;
	while (describeBlock !== circus.getState().rootDescribeBlock) {
		elements.unshift(describeBlock.name);
		if (describeBlock.parent) {
			describeBlock = describeBlock.parent;
		}
	}
	return elements;
};
