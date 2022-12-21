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
import { fuzz, skip, FuzzerStartError } from "./fuzz";
import { cleanupJestRunner } from "./errorUtils";

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
			const { default: setup } = await import(file);
			setup();
		}

		JazzerWorker.setupGlobal();

		for (const file of test.context.config.setupFilesAfterEnv) {
			const { default: setup } = await import(file);
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
		await import(test.path);
		return circus.getState();
	}

	private async runDescribeBlock(
		block: Circus.DescribeBlock,
		hasFocusedTests: boolean,
		testNamePattern: string,
		ancestors: string[] = []
	) {
		const adjustedPattern = this.adjustTestPattern(ancestors, testNamePattern);

		await this.runHooks("beforeAll", block, ancestors);

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
				await this.runDescribeBlock(
					child,
					hasFocusedTests,
					testNamePattern,
					nextAncestors
				);
			} else if (child.type === "test") {
				await this.runHooks("beforeEach", block, nextAncestors, true);
				await this.runTestEntry(child, ancestors);
				await this.runHooks("afterEach", block, nextAncestors, true);
			}
		}

		await this.runHooks("afterAll", block, ancestors);
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
				e.stack = cleanupJestRunner(e.stack);
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

	// noinspection JSUnusedLocalSymbols
	private async runHooks(
		hookType: string,
		block: Circus.DescribeBlock | Circus.TestEntry,
		ancestors: string[],
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		shouldRunInAncestors = false
	) {
		// TODO: Implement
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
			skipped: false,
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
}
