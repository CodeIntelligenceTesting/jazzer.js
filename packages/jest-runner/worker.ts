/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Test } from "jest-runner";
import { Config, Circus, Global } from "@jest/types";
import { TestResult } from "@jest/test-result";
import { performance } from "perf_hooks";
import { jestExpect as expect } from "@jest/expect";
import * as circus from "jest-circus";
import { inspect } from "util";

import { registerFuzzExtension } from "./jest";

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

	static currentTestPath(): string {
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
		globalThis.it = circus.it;
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

		registerFuzzExtension();
	}

	async run(test: Test, config: Config.GlobalConfig) {
		JazzerWorker.#currentTestPath = test.path;
		await this.initialize(test);

		const testNamePattern =
			config.testNamePattern != null
				? new RegExp(config.testNamePattern, "i")
				: undefined;

		const state = await this.loadTests(test);

		this.#testSummary.start = performance.now();
		await this.runDescribeBlock(
			state.rootDescribeBlock,
			state.hasFocusedTests,
			testNamePattern
		);
		this.#testSummary.end = performance.now();

		return this.testResult(test);
	}

	private async loadTests(test: Test): Promise<circus.State> {
		circus.resetState();
		await import(test.path);
		return circus.getState();
	}

	private async runDescribeBlock(
		block: Circus.DescribeBlock,
		hasFocusedTests: boolean,
		testNamePattern?: RegExp,
		ancestors: string[] = []
	) {
		await this.runHooks("beforeAll", block, ancestors);

		for (const child of block.children) {
			const nextAncestors = ancestors.concat(child.name);

			if (
				child.mode === "skip" ||
				(child.type === "test" &&
					this.shouldSkipTest(
						this.fullTestPath(nextAncestors),
						testNamePattern
					))
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

		const errors = [];
		// @ts-ignore
		await this.callAsync(testEntry.fn).catch((error) => {
			errors.push(error);
		});

		// Get suppressed errors from ``jest-matchers`` that weren't thrown during
		// test execution and add them to the test result, potentially failing
		// a passing test.
		const state = expect.getState();
		expect.setState({ suppressedErrors: [] });
		if (state.suppressedErrors.length > 0) {
			errors.unshift(...state.suppressedErrors);
		}

		if (errors.length > 0) {
			this.#testSummary.failures++;
		} else {
			this.#testSummary.passes++;
		}
		this.#testResults.push({
			ancestors,
			title: testEntry.name,
			skipped: false,
			errors: errors,
		});
	}

	private async runHooks(
		hookType: string,
		block: Circus.DescribeBlock | Circus.TestEntry,
		ancestors: string[],
		shouldRunInAncestors = false
	) {
		//
	}

	private callAsync(fn: Global.TestFn) {
		if (fn.length >= 1) {
			// return new Promise((resolve, reject) => {
			// 	fn((err, result) => {
			// 		if (err) {
			// 			reject(err);
			// 		} else {
			// 			resolve(result);
			// 		}
			// 	});
			// });
		} else {
			// @ts-ignore
			return Promise.resolve().then(fn);
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
			result.ancestors.concat(result.title).join(" > ") +
			"\n" +
			result.errors
				.map((error) => inspect(error).replace(/^/gm, "    "))
				.join("\n") +
			"\n"
		);
	}

	private fullTestPath(elements: string[]): string {
		return elements.join(" ");
	}

	private shouldSkipTest(testName: string, testNamePatternRE?: RegExp) {
		return testNamePatternRE && !testNamePatternRE.test(testName);
	}
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
