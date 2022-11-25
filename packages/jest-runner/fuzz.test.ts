/* eslint-disable @typescript-eslint/ban-ts-comment */
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

// Mock Corpus class so that no local directories are created during test.
const inputsPathsMock = jest.fn();
jest.mock("./corpus", () => {
	return {
		Corpus: class Tmp {
			inputsPaths = inputsPathsMock;
		},
	};
});

// Mock core package to intercept calls to startFuzzing.
const startFuzzingMock = jest.fn();
const skipMock = jest.fn();
jest.mock("@jazzer.js/core", () => {
	return {
		startFuzzingAsyncNoInit: startFuzzingMock,
	};
});

import { Global } from "@jest/types";
import { Corpus } from "./corpus";
import {
	FuzzerStartError,
	runInFuzzingMode,
	runInRegressionMode,
} from "./fuzz";

describe("fuzz", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("runInFuzzingMode", () => {
		it("executes only one fuzz target function", () => {
			const testFn = jest.fn();
			const corpus: Corpus = new Corpus("", []);
			const fuzzerOptions: string[] = [];
			withMockTest(() => {
				// First call should start the fuzzer
				runInFuzzingMode("first", testFn, corpus, fuzzerOptions);
				expect(startFuzzingMock).toBeCalledTimes(1);

				// Should fail to start the fuzzer a second time
				expect(() => {
					runInFuzzingMode("second", testFn, corpus, fuzzerOptions);
				}).toThrow(FuzzerStartError);
				expect(startFuzzingMock).toBeCalledTimes(1);
			});
		});
	});

	describe("runInRegressionMode", () => {
		it("Executes one test per seed file", () => {
			const filePaths = [
				["a", "/a"],
				["b", "/b"],
			];
			inputsPathsMock.mockReturnValue(filePaths);
			const testFn = jest.fn();
			const corpus: Corpus = new Corpus("", []);
			const fuzzerOptions: string[] = [];
			withMockTest(() => {
				runInRegressionMode("first", testFn, corpus, fuzzerOptions);
				expect(startFuzzingMock).toBeCalledTimes(filePaths.length);
			});
		});

		it("Skips tests without seed files", () => {
			inputsPathsMock.mockReturnValue([]);
			const testFn = jest.fn();
			const corpus: Corpus = new Corpus("", []);
			const fuzzerOptions: string[] = [];
			withMockTest(() => {
				runInRegressionMode("first", testFn, corpus, fuzzerOptions);
				expect(startFuzzingMock).not.toBeCalled();
				expect(skipMock).toHaveBeenCalled();
			});
		});
	});
});

// Executing tests in tests is not allowed, hence we temporarily swap the
// implementation of test and describe to directly invoke their lambdas.
// Also register a mock at test.skipMock to check if it's invoked.
const withMockTest = (block: () => void) => {
	const tmpTest = globalThis.test;
	const tmpDescribe = globalThis.describe;
	try {
		// Ignore missing properties. We know how "test" is called in the
		// invoked fuzz function.
		// @ts-ignore
		globalThis.test = (name: Global.TestNameLike, fn: Global.TestFn) => {
			// Directly execute passed in test function, as it will not be
			// executed by jest anymore.
			if (fn) {
				// Also don't bother with setting up a test contex.
				// @ts-ignore
				fn();
			}
		};
		// @ts-ignore
		globalThis.test.skip = skipMock;
		// Directly invoke describe as well.
		// @ts-ignore
		globalThis.describe = globalThis.test;
		block();
	} finally {
		globalThis.test = tmpTest;
		globalThis.describe = tmpDescribe;
	}
};
