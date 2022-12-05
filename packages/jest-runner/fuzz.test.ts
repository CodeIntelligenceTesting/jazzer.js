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

import fs from "fs";
import * as tmp from "tmp";
import { Global } from "@jest/types";
import { Corpus } from "./corpus";

// Cleanup created files on exit
tmp.setGracefulCleanup();

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
		it("executes only one fuzz target function", async () => {
			const testFn = jest.fn();
			const corpus: Corpus = new Corpus("", []);
			const fuzzerOptions: string[] = [];

			// First call should start the fuzzer
			await withMockTest(() => {
				runInFuzzingMode("first", testFn, corpus, fuzzerOptions);
			});
			expect(startFuzzingMock).toBeCalledTimes(1);

			// Should fail to start the fuzzer a second time
			await expect(
				withMockTest(async () => {
					runInFuzzingMode("second", testFn, corpus, fuzzerOptions);
				})
			).rejects.toThrow(FuzzerStartError);
			expect(startFuzzingMock).toBeCalledTimes(1);
		});
	});

	describe("runInRegressionMode", () => {
		it("executes one test per seed file", async () => {
			const inputPaths = mockInputPaths("file1", "file2");
			const testFn = jest.fn();
			const corpus: Corpus = new Corpus("", []);
			await withMockTest(() => {
				runInRegressionMode("fuzz", testFn, corpus);
			});
			inputPaths.forEach(([name]) => {
				expect(testFn).toHaveBeenCalledWith(Buffer.from(name));
			});
		});

		it("skips tests without seed files", async () => {
			mockInputPaths();
			const testFn = jest.fn();
			const corpus: Corpus = new Corpus("", []);
			await withMockTest(() => {
				runInRegressionMode("fuzz", testFn, corpus);
			});
			expect(testFn).not.toBeCalled();
			expect(skipMock).toHaveBeenCalled();
		});
	});
});

// Executing tests in tests is not allowed, hence we temporarily swap the
// implementation of test and describe to directly invoke their lambdas.
// Also register a mock at test.skipMock to check if it's invoked.
const withMockTest = async (block: () => void): Promise<unknown> => {
	const tmpTest = globalThis.test;
	const tmpDescribe = globalThis.describe;
	// Variable to store the registered fuzz tests for later execution.
	const testFn: Global.TestFn[] = [];
	try {
		// Directly invoke describe as there are currently no async describe tests.
		// @ts-ignore
		globalThis.describe = (name: Global.TestNameLike, fn: Global.TestFn) => {
			// @ts-ignore
			fn();
		};

		// Mock test with version that stores the registered test. Ignore missing
		// properties, as those are not needed in the tests.
		// @ts-ignore
		globalThis.test = (name: Global.TestNameLike, fn: Global.TestFn) => {
			testFn.push(fn);
		};
		// @ts-ignore
		globalThis.test.skip = skipMock;

		// Execute given block so that the test functions are actually registered.
		block();
		// Chain execution of the stored test functions.
		let promise: Promise<unknown> = Promise.resolve();
		testFn.forEach((t) => {
			// @ts-ignore
			promise = promise.then(t);
		});
		return promise;
	} finally {
		globalThis.test = tmpTest;
		globalThis.describe = tmpDescribe;
	}
};

const mockInputPaths = (...inputPaths: string[]) => {
	const mockInputPaths = inputPaths.map((p) => {
		const path = tmp.fileSync().name;
		fs.writeFileSync(path, p);
		return [p, path];
	});
	inputsPathsMock.mockReturnValue(mockInputPaths);
	return mockInputPaths;
};
