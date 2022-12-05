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

import { Global } from "@jest/types";
import * as core from "@jazzer.js/core";
import { FuzzFn } from "@jazzer.js/fuzzer";
import { loadConfig } from "./config";
import { JazzerWorker } from "./worker";
import { Corpus } from "./corpus";
import * as circus from "jest-circus";
import * as fs from "fs";

// Globally track when the fuzzer is started in fuzzing mode.
let fuzzerStarted = false;

// Error indicating that the fuzzer was already started.
export class FuzzerStartError extends Error {}

// Use Jests global object definition.
const g = globalThis as unknown as Global.Global;

export type FuzzTest = (name: Global.TestNameLike, fn: FuzzFn) => void;

export const fuzz: FuzzTest = (name, fn) => {
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
	if (fuzzingConfig.dryRun) {
		runInRegressionMode(name, fn, corpus);
	} else {
		const fuzzerOptions = core.addFuzzerOptionsForDryRun(
			fuzzingConfig.fuzzerOptions,
			fuzzingConfig.dryRun
		);
		runInFuzzingMode(name, fn, corpus, fuzzerOptions);
	}
};

export const runInRegressionMode = (
	name: Global.TestNameLike,
	fn: FuzzFn,
	corpus: Corpus
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
				// Support sync and async fuzz tests.
				return Promise.resolve().then(() => fn(content));
			});
		});
	});
};

export const runInFuzzingMode = (
	name: Global.TestNameLike,
	fn: FuzzFn,
	corpus: Corpus,
	fuzzerOptions: string[]
) => {
	fuzzerOptions.unshift(corpus.inputsDirectory);
	fuzzerOptions.push("-artifact_prefix=" + corpus.inputsDirectory);
	g.test(name, () => {
		// Fuzzing is only allowed to start once in a single nodejs instance.
		if (fuzzerStarted) {
			const message = `Fuzzer already started. Please provide single fuzz test using --testNamePattern. Skipping test "${toTestName(
				name
			)}"`;
			const error = new FuzzerStartError(message);
			// Remove stack trace as it is shown in the CLI / IDE and points to internal code.
			error.stack = undefined;
			throw error;
		}
		fuzzerStarted = true;
		return core.startFuzzingAsyncNoInit(fn, fuzzerOptions);
	});
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
	throw new Error(`Invalid test name "${name}"`);
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
