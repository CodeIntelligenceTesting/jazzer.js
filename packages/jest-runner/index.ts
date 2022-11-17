import pLimit = require("p-limit");

import {
	TestRunnerOptions,
	Test,
	TestRunnerContext,
	TestWatcher,
	CallbackTestRunner,
	OnTestStart,
	OnTestSuccess,
	OnTestFailure,
} from "jest-runner";

import { Config } from "@jest/types";
import { JazzerWorker } from "./worker";
import { registerGlobals, initFuzzing } from "@jazzer.js/core";
import { loadConfig } from "./config";

class FuzzRunner extends CallbackTestRunner {
	constructor(globalConfig: Config.GlobalConfig, context: TestRunnerContext) {
		super(globalConfig, context);
		registerGlobals();
	}

	async runTests(
		tests: Array<Test>,
		watcher: TestWatcher,
		onStart: OnTestStart,
		onResult: OnTestSuccess,
		onFailure: OnTestFailure,
		options: TestRunnerOptions
	): Promise<void> {
		const config = loadConfig();
		initFuzzing(config);
		return options.serial
			? this.#runTestsInBand(tests, watcher, onStart, onResult, onFailure)
			: this.#runTestsInParallel(tests, watcher, onStart, onResult, onFailure);
	}

	async #runTestsInBand(
		tests: Array<Test>,
		watcher: TestWatcher,
		onStart: OnTestStart,
		onResult: OnTestSuccess,
		onFailure: OnTestFailure
	) {
		process.env.JEST_WORKER_ID = "1";
		const limit = pLimit(1);
		return tests.reduce(
			(promise, test) =>
				limit(() =>
					promise.then(async () => {
						if (watcher.isInterrupted()) {
							throw new CancelRun();
						}

						await onStart(test);
						const worker = new JazzerWorker();

						worker.run(test, this._globalConfig).then(
							(result) => onResult(test, result),
							(error) => onFailure(test, error)
						);
					})
				),
			Promise.resolve()
		);
	}

	async #runTestsInParallel(
		tests: Array<Test>,
		watcher: TestWatcher,
		onStart: OnTestStart,
		onResult: OnTestSuccess,
		onFailure: OnTestFailure
	) {
		return this.#runTestsInBand(tests, watcher, onStart, onResult, onFailure);
	}
}

class CancelRun extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "CancelRun";
	}
}

export default FuzzRunner;

export { loadConfig } from "./config";
