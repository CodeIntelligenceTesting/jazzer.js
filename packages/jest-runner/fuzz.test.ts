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

// Mock Corpus class so that no local directories are created during test.
import fs from "fs";
import * as tmp from "tmp";
import { Circus, Global } from "@jest/types";
import { Corpus } from "./corpus";
import {
	fuzz,
	FuzzerError,
	FuzzTest,
	JestTestMode,
	runInRegressionMode,
} from "./fuzz";
import { Options, startFuzzingNoInit } from "@jazzer.js/core"; // Cleanup created files on exit

const inputsPathsMock = jest.fn();
jest.mock("./corpus", () => {
	return {
		Corpus: class Tmp {
			inputsPaths = inputsPathsMock;
		},
	};
});

// Mock core package to intercept calls to startFuzzing.
const skipMock = jest.fn();
jest.mock("@jazzer.js/core", () => {
	return {
		startFuzzingNoInit: jest.fn(),
		wrapFuzzFunctionForBugDetection: (fn: object) => fn,
	};
});

// Mock console error logs
const consoleErrorMock = jest.spyOn(console, "error").mockImplementation();

// Cleanup created files on exit
tmp.setGracefulCleanup();

describe("fuzz", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("runInFuzzingMode", () => {
		it("execute test matching original test name pattern", async () => {
			await withMockTest(() => {
				const originalTestNamePattern = jest
					.fn()
					.mockReturnValue(/^myFuzzTest$/);
				invokeFuzz({ originalTestNamePattern })("myFuzzTest", jest.fn());
			});
			expect(startFuzzingNoInit).toBeCalledTimes(1);
		});

		it("skip test not matching original test name pattern", async () => {
			await withMockTest(() => {
				const originalTestNamePattern = jest
					.fn()
					.mockReturnValue(/^not_existing$/);
				invokeFuzz({ originalTestNamePattern })("myFuzzTest", jest.fn());
			});
			expect(startFuzzingNoInit).toBeCalledTimes(0);
		});
	});

	describe("runInRegressionMode", () => {
		it("execute one test per seed file", async () => {
			const inputPaths = mockInputPaths("file1", "file2");
			const corpus = new Corpus("", []);
			const testFn = jest.fn();
			await withMockTest(() => {
				runInRegressionMode(
					"fuzz",
					testFn,
					corpus,
					{} as Options,
					globalThis as Global.Global,
					"standard",
				);
			});
			inputPaths.forEach(([name]) => {
				expect(testFn).toHaveBeenCalledWith(Buffer.from(name));
			});
		});

		it("support done callback fuzz test functions", async () => {
			let called = false;
			await withMockTest(() => {
				runInRegressionMode(
					"fuzz",
					(data: Buffer, done: (e?: Error) => void) => {
						called = true;
						done();
					},
					mockDefaultCorpus(),
					{} as Options,
					globalThis as Global.Global,
					"standard",
				);
			});
			expect(called).toBeTruthy();
		});

		it("support async fuzz test functions", async () => {
			let called = false;
			await withMockTest(() => {
				runInRegressionMode(
					"fuzz",
					async () => {
						called = true;
						return new Promise((resolve) => {
							setTimeout(() => {
								resolve("result");
							}, 100);
						});
					},
					mockDefaultCorpus(),
					{} as Options,
					globalThis as Global.Global,
					"standard",
				);
			});
			expect(called).toBeTruthy();
		});

		it("fail on done callback with async result", async () => {
			const rejects = expect(
				withMockTest(() => {
					runInRegressionMode(
						"fuzz",
						// Parameters needed to pass in done callback.
						(ignored: Buffer, ignored2: (e?: Error) => void) => {
							return new Promise(() => {
								// promise is ignored due to done callback
							});
						},
						mockDefaultCorpus(),
						{} as Options,
						globalThis as Global.Global,
						"standard",
					);
				}),
			).rejects;
			await rejects.toThrow(FuzzerError);
			await rejects.toThrowError(new RegExp(".*async or done.*"));
		});

		// This test is disabled as it prints an additional error message to the console,
		// which breaks the CI pipeline.
		it.skip("print error on multiple calls to done callback", async () => {
			await new Promise((resolve, reject) => {
				withMockTest(() => {
					runInRegressionMode(
						"fuzz",
						(ignored: Buffer, done: (e?: Error) => void) => {
							done();
							done();
							// Use another promise to stop test from finishing too fast.
							resolve("done called multiple times");
						},
						mockDefaultCorpus(),
						{} as Options,
						globalThis as Global.Global,
						"standard",
					);
				}).then(resolve, reject);
			});
			expect(consoleErrorMock).toHaveBeenCalledTimes(1);
		});

		it("always call tests with empty input", async () => {
			mockInputPaths();
			const corpus: Corpus = new Corpus("", []);
			const testFn = jest.fn();
			await withMockTest(() => {
				runInRegressionMode(
					"fuzz",
					testFn,
					corpus,
					{} as Options,
					globalThis as Global.Global,
					"standard",
				);
			});
			expect(testFn).toHaveBeenCalledWith(Buffer.from(""));
			expect(skipMock).not.toHaveBeenCalled();
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
	const testFns: Global.TestFn[] = [];
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
			testFns.push(fn);
		};
		// @ts-ignore
		globalThis.test.skip = skipMock;

		// Execute given block so that the test functions are actually registered.
		block();
		// Chain execution of the stored test functions.
		let promise: Promise<unknown> = Promise.resolve();
		testFns.forEach((t) => {
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

const mockDefaultCorpus = () => {
	mockInputPaths("seed");
	return new Corpus("", []);
};

function invokeFuzz(
	params: Partial<{
		globals: Global.Global;
		testFile: string;
		fuzzingConfig: Options;
		currentTestState: () => Circus.DescribeBlock | undefined;
		currentTestTimeout: () => number | undefined;
		originalTestNamePattern: () => RegExp | undefined;
		mode: JestTestMode;
	}>,
): FuzzTest {
	const paramsWithDefaults = {
		globals: globalThis as Global.Global,
		testFile: "testfile",
		fuzzingConfig: {
			fuzzerOptions: [""],
			mode: "fuzzing",
		} as Options,
		currentTestState: jest.fn().mockReturnValue({}),
		currentTestTimeout: jest.fn().mockReturnValue(undefined),
		originalTestNamePattern: jest.fn().mockReturnValue(undefined),
		mode: "standard" as JestTestMode,
		...params,
	};
	return fuzz(
		paramsWithDefaults.globals,
		paramsWithDefaults.testFile,
		paramsWithDefaults.fuzzingConfig,
		paramsWithDefaults.currentTestState,
		paramsWithDefaults.currentTestTimeout,
		paramsWithDefaults.originalTestNamePattern,
		paramsWithDefaults.mode,
	);
}
