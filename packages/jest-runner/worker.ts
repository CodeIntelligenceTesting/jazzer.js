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

/* eslint-disable @typescript-eslint/ban-ts-comment */

import { Test } from "jest-runner";
import { Circus, Config } from "@jest/types";
import { TestResult } from "@jest/test-result";
import { performance } from "perf_hooks";
import { jestExpect as expect } from "@jest/expect";
import * as circus from "jest-circus";
import { formatResultsErrors } from "jest-message-util";
import { inspect } from "util";
import { fuzz, FuzzerStartError, skip } from "./fuzz";
import { cleanupJestRunnerStack, removeTopFramesFromError } from "./errorUtils";

function isGeneratorFunction(obj?: unknown): boolean {
	return (
		!!obj &&
		typeof (obj as Generator).next === "function" &&
		typeof (obj as Generator)[Symbol.iterator] === "function"
	);
}

type JazzerTestStatus = {
	failures: number;
	passes: number;
	pending: number;
	start: number;
	end: number;
};

type JazzerTestResult = {
	ancestors: string[];
	title: string;
	skipped: boolean;
	errors: Error[];
	duration?: number;
};

export class JazzerWorker {
	static #workerInitialized = false;
	static #currentTestPath = "";
	readonly defaultTimeout = 5000; // Default Jest timeout

	#testSummary: JazzerTestStatus;
	#testResults: JazzerTestResult[];

	constructor() {
		this.#testSummary = {
			passes: 0,
			failures: 0,
			pending: 0,
			start: 0,
			end: 0,
		};
		this.#testResults = [];
	}

	static get currentTestPath(): string {
		return this.#currentTestPath;
	}

	private async initialize(test: Test) {
		if (JazzerWorker.#workerInitialized) {
			return;
		}
		JazzerWorker.#workerInitialized = true;

		for (const file of test.context.config.setupFiles) {
			const { default: setup } = await this.importFile(file);
			setup();
		}

		JazzerWorker.setupGlobal();

		for (const file of test.context.config.setupFilesAfterEnv) {
			const { default: setup } = await this.importFile(file);
			setup();
		}
	}

	private static setupGlobal() {
		// @ts-ignore
		globalThis.expect = expect;
		// @ts-ignore
		globalThis.test = circus.test;
		// @ts-ignore
		globalThis.test.fuzz = fuzz;
		// @ts-ignore
		globalThis.test.skip.fuzz = skip;
		// @ts-ignore
		globalThis.it = circus.it;
		// @ts-ignore
		globalThis.it.fuzz = fuzz;
		// @ts-ignore
		globalThis.it.skip.fuzz = skip;
		// @ts-ignore
		globalThis.describe = circus.describe;
		// @ts-ignore
		globalThis.beforeAll = circus.beforeAll;
		// @ts-ignore
		globalThis.afterAll = circus.afterAll;
		// @ts-ignore
		globalThis.beforeEach = circus.beforeEach;
		// @ts-ignore
		globalThis.afterEach = circus.afterEach;
	}

	async run(test: Test, config: Config.GlobalConfig) {
		JazzerWorker.#currentTestPath = test.path;
		await this.initialize(test);

		const state = await this.loadTests(test);

		this.#testSummary.start = performance.now();
		await this.runDescribeBlock(
			state.rootDescribeBlock,
			state.hasFocusedTests,
			config.testNamePattern ?? ""
		);
		this.#testSummary.end = performance.now();

		const result = this.testResult(test);
		result.failureMessage = formatResultsErrors(
			result.testResults,
			test.context.config,
			config,
			test.path
		);
		return result;
	}

	private async loadTests(test: Test): Promise<circus.State> {
		circus.resetState();
		await this.importFile(test.path);
		return circus.getState();
	}

	private async runDescribeBlock(
		block: Circus.DescribeBlock,
		hasFocusedTests: boolean,
		testNamePattern: string,
		ancestors: string[] = []
	) {
		const adjustedPattern = this.adjustTestPattern(ancestors, testNamePattern);

		await this.runHooks("beforeAll", block);

		for (const child of block.children) {
			const nextAncestors = ancestors.concat(child.name);
			if (
				child.mode === "skip" ||
				(child.type === "test" &&
					this.shouldSkipTest(nextAncestors, adjustedPattern))
			) {
				this.#testSummary.pending++;
				this.#testResults.push({
					ancestors,
					title: child.name,
					errors: [],
					skipped: true,
				});
			} else if (child.type === "describeBlock") {
				await this.runHooks("beforeEach", block, true);
				await this.runDescribeBlock(
					child,
					hasFocusedTests,
					testNamePattern,
					nextAncestors
				);
				await this.runHooks("afterEach", block, true);
			} else if (child.type === "test") {
				await this.runHooks("beforeEach", block, true);
				await this.runTestEntry(child, ancestors);
				await this.runHooks("afterEach", block, true);
			}
		}

		await this.runHooks("afterAll", block);
	}

	private async runTestEntry(
		testEntry: Circus.TestEntry,
		ancestors: string[] = []
	) {
		expect.setState({
			suppressedErrors: [],
			currentTestName: this.fullTestPath(ancestors.concat(testEntry.name)),
		});

		let skipTest = false;
		let errors = [];
		await Promise.resolve()
			// @ts-ignore
			.then(testEntry.fn)
			.catch((error) => {
				// Mark fuzzer tests as skipped and not as error.
				if (error instanceof FuzzerStartError) {
					skipTest = true;
				}
				errors.push(error);
			});

		// Get suppressed errors from ``jest-matchers`` that weren't thrown during
		// test execution and add them to the test result, potentially failing
		// a passing test.
		const state = expect.getState();
		if (state.suppressedErrors.length > 0) {
			errors.unshift(...state.suppressedErrors);
		}

		errors = errors.map((e) => {
			if (e && e.stack) {
				e.stack = cleanupJestRunnerStack(e.stack);
			}
			return e;
		});

		if (skipTest) {
			this.#testSummary.pending++;
		} else if (errors.length > 0) {
			this.#testSummary.failures++;
		} else {
			this.#testSummary.passes++;
		}
		this.#testResults.push({
			ancestors,
			title: testEntry.name,
			skipped: skipTest,
			errors,
		});
	}

	private async runHooks(
		hookType: string,
		block: Circus.DescribeBlock,
		shouldRunInAncestors = false
	) {
		const hooks =
			shouldRunInAncestors && block.parent ? block.parent.hooks : block.hooks;
		for (const hook of hooks.filter((hook) => hook.type === hookType)) {
			const timeout = hook.timeout ?? this.defaultTimeout;
			await this.runHook(block, hook, timeout);
		}
	}

	private async runHook(
		block: Circus.DescribeBlock,
		hook: Circus.Hook,
		timeout: number
	) {
		let timeoutID: NodeJS.Timeout;
		return new Promise((resolve, reject) => {
			timeoutID = setTimeout(() => {
				reject(
					removeTopFramesFromError(
						new Error(
							`Exceeded timeout of ${timeout} ms for "${hook.type}" of "${block.name}".\nIncrease the timeout value, if this is a long-running test.`
						),
						1
					)
				);
			}, timeout);
			this.executeHook(block, hook, resolve, reject);
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
			}
		);
	}

	private executeHook(
		block: Circus.DescribeBlock,
		hook: Circus.Hook,
		resolve: (value: unknown) => void,
		reject: (reason?: unknown) => void
	) {
		let result;
		if (hook.fn.length > 0) {
			result = new Promise((resolve, reject) => {
				let doneCalled = false;
				const done = (doneMsg?: string | Error) => {
					if (doneCalled) {
						// As the promise was already resolved in the last invocation, and
						// there could be quite some time until this one, there is not much we
						// can do besides printing an error message.
						console.error(
							`Expected done to be called once, but it was called multiple times in "${hook.type}" of "${block.name}".`
						);
					}
					doneCalled = true;
					if (typeof doneMsg === "string") {
						reject(
							removeTopFramesFromError(new Error(`Failed: ${doneMsg}`), 1)
						);
					} else if (doneMsg) {
						reject(doneMsg);
					} else {
						resolve(undefined);
					}
				};
				const hookResult = hook.fn(done);
				// These checks are executed before the callback, hence rejecting
				// the promise is still possible.
				if (hookResult instanceof Promise) {
					reject(
						removeTopFramesFromError(
							new Error(
								`Using done callback in async "${hook.type}" hook of "${block.name}" is not allowed.`
							),
							1
						)
					);
				} else if (isGeneratorFunction(hookResult)) {
					reject(
						removeTopFramesFromError(
							new Error(
								`Generators are currently not supported by Jazzer.js but used in "${hook.type}" of "${block.name}".`
							),
							1
						)
					);
				}
			});
		} else {
			// @ts-ignore
			result = hook.fn();
		}

		if (result instanceof Promise) {
			result.then(resolve, reject);
		} else if (isGeneratorFunction(result)) {
			reject(
				removeTopFramesFromError(
					new Error(
						`Generators are currently not supported by Jazzer.js but used in "${hook.type}" of "${block.name}".`
					),
					1
				)
			);
		} else {
			resolve(result);
		}
	}

	private testResult(test: Test): TestResult {
		const runtime = this.#testSummary.end - this.#testSummary.start;

		return {
			// coverage: globalThis.__coverage__,
			console: undefined,
			failureMessage: this.#testResults
				.filter((t) => t.errors.length > 0)
				.map(this.failureToString)
				.join("\n"),
			leaks: false,
			numFailingTests: this.#testSummary.failures,
			numPassingTests: this.#testSummary.passes,
			numPendingTests: this.#testSummary.pending,
			numTodoTests: 0,
			openHandles: [],
			perfStats: {
				start: this.#testSummary.start,
				end: this.#testSummary.end,
				runtime: Math.round(runtime), // ms precision
				slow: runtime / 1000 > test.context.config.slowTestThreshold,
			},
			skipped: this.#testResults.every((t) => t.skipped),
			snapshot: {
				added: 0,
				fileDeleted: false,
				matched: 0,
				unchecked: 0,
				uncheckedKeys: [],
				unmatched: 0,
				updated: 0,
			},
			testExecError: undefined,
			testFilePath: test.path,
			testResults: this.#testResults.map((testResult) => {
				return {
					ancestorTitles: testResult.ancestors,
					duration: testResult.duration ? testResult.duration / 1000 : null,
					failureDetails: testResult.errors,
					failureMessages: testResult.errors.length
						? [this.failureToString(testResult)]
						: [],
					fullName: testResult.title,
					numPassingAsserts: testResult.errors.length > 0 ? 1 : 0,
					status: testResult.skipped
						? "pending"
						: testResult.errors.length > 0
						? "failed"
						: "passed",
					title: testResult.title,
				};
			}),
		};
	}

	private failureToString(result: JazzerTestResult) {
		return (
			result.errors
				.map((error) => inspect(error).replace(/^/gm, "    "))
				.join("\n") + "\n"
		);
	}

	/**
	 *  If we always remove the dollar sign, then the runner will run all tests matching to a test name.
	 *  For that reason, we only remove the dollar sign if the test name matches exactly.
	 */
	private adjustTestPattern(
		ancestors: string[],
		testNamePattern: string
	): string {
		// IntelliJ interprets our fuzz extension as a test and thus appends a dollar sign
		// to the fuzz test pattern when started from the IDE. This is fine for the fuzzing mode
		// where we register a normal test. However, in the regression mode, we register a
		// describe-block. This results in the child tests being skipped.
		if (
			testNamePattern.endsWith("$") &&
			this.doesMatch(ancestors, testNamePattern)
		) {
			return testNamePattern.slice(0, -1);
		}
		return testNamePattern;
	}

	private shouldSkipTest(ancestors: string[], testNamePattern: string) {
		return !this.doesMatch(ancestors, testNamePattern);
	}

	private fullTestPath(elements: string[]): string {
		return elements.join(" ");
	}

	private doesMatch(ancestors: string[], testNamePattern: string) {
		const testPath = this.fullTestPath(ancestors);
		if (testNamePattern === "") {
			return true;
		}
		const testNamePatternRE = new RegExp(testNamePattern, "i");
		return testNamePatternRE.test(testPath);
	}

	private async importFile(file: string) {
		// file: schema is required on Windows
		if (!file.startsWith("file://")) {
			file = "file://" + file;
		}
		return await import(file);
	}
}
