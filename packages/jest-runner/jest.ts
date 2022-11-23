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

// Use jests global object definition
const g = globalThis as unknown as Global.Global;

export type FuzzTest = (name: Global.TestNameLike, fn: FuzzFn) => void;

export const fuzz: FuzzTest = (title, fuzzTest) => {
	const fuzzingConfig = loadConfig();
	const fuzzerOptions = core.addFuzzerOptionsForDryRun(
		fuzzingConfig.fuzzerOptions,
		fuzzingConfig.dryRun
	);

	const testName = toTestName(title);

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

	if (fuzzingConfig.dryRun) {
		g.describe(title, () => {
			corpus.inputPaths().forEach(([name, path]) => {
				const runOptions = fuzzerOptions.concat(path);
				const testFn: Global.TestFn = () => {
					return core.startFuzzingNoInit(fuzzTest, runOptions);
				};
				g.test(name, testFn);
			});
		});
	} else {
		fuzzerOptions.unshift(corpus.inputDirectory);
		fuzzerOptions.push("-artifact_prefix=" + corpus.outputDirectory);
		const testFn: Global.TestFn = () => {
			return core.startFuzzingNoInit(fuzzTest, fuzzerOptions);
		};
		g.test(title, testFn);
	}
};

const toTestName = (title: Global.TestNameLike): string => {
	switch (typeof title) {
		case "string":
			return title;
		case "number":
			return `${title}`;
		case "function":
			if (title.name) {
				return title.name;
			}
	}
	throw new Error(`Invalid test name "${title}"`);
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
