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

const path = require("path");

const { FuzzTestBuilder } = require("../helpers.js");

const testDirectory = __dirname;
const syncInfo =
	"Exclusively observed synchronous return values from fuzzed function. Fuzzing in synchronous mode seems beneficial!";
const asyncInfo =
	"Observed asynchronous return values from fuzzed function. Fuzzing in asynchronous mode seems beneficial!";

describe("Execute a sync runner", () => {
	it("Expect a hint due to async and sync return values", () => {
		const testCaseDir = path.join(testDirectory, "syncRunnerMixedReturns");
		const log = executeFuzzTest(true, true, testCaseDir);
		expect(log).toContain(asyncInfo.trim());
	});
	it("Expect a hint due to exclusively async return values", () => {
		const testCaseDir = path.join(testDirectory, "syncRunnerAsyncReturns");
		const log = executeFuzzTest(true, false, testCaseDir);
		expect(log.trim()).toContain(asyncInfo.trim());
	});
	it("Expect no hint due to strict synchronous return values", () => {
		const testCaseDir = path.join(testDirectory, "syncRunnerSyncReturns");
		const log = executeFuzzTest(true, false, testCaseDir);
		expect(log.includes(syncInfo)).toBeFalsy();
		expect(log.includes(asyncInfo)).toBeFalsy();
	});
});

describe("Execute a async runner", () => {
	it("Expect no hint due to async and sync return values", () => {
		const testCaseDir = path.join(testDirectory, "asyncRunnerMixedReturns");
		const log = executeFuzzTest(false, false, testCaseDir);
		expect(log.includes(syncInfo)).toBeFalsy();
		expect(log.includes(asyncInfo)).toBeFalsy();
	});
	it("Expect a hint due to exclusively sync return values", () => {
		const testCaseDir = path.join(testDirectory, "asyncRunnerSyncReturns");
		const log = executeFuzzTest(false, false, testCaseDir);
		expect(log.trim()).toContain(syncInfo.trim());
	});
	it("Expect no hint due to strict asynchronous return values", () => {
		const testCaseDir = path.join(testDirectory, "asyncRunnerAsyncReturns");
		const log = executeFuzzTest(false, false, testCaseDir);
		expect(log.includes(syncInfo)).toBeFalsy();
		expect(log.includes(asyncInfo)).toBeFalsy();
	});
});

function executeFuzzTest(sync, verbose, dir) {
	const fuzzTest = new FuzzTestBuilder()
		.fuzzEntryPoint("fuzz")
		.runs(5000)
		.dir(dir)
		.sync(sync)
		.expectedErrors("Error")
		.build();
	fuzzTest.execute();
	return fuzzTest.stderr;
}
