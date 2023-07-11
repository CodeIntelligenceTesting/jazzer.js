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

const { spawnSync } = require("child_process");
const path = require("path");
const SyncInfo =
	"Exclusively observed synchronous return values from fuzzed function. Fuzzing in synchronous mode seems benefical!";
const AsyncInfo =
	"Observed asynchronous return values from fuzzed function. Fuzzing in asynchronous mode seems benefical!";

// current working directory
const testDirectory = __dirname;

describe("Execute a sync runner", () => {
	it("Expect a hint due to async and sync return values", () => {
		const testCaseDir = path.join(testDirectory, "syncRunnerMixedReturns");
		const log = executeFuzzTest(true, false, testCaseDir);
		expect(log).toContain(AsyncInfo.trim());
	});
	it("Expect a hint due to exclusively async return values", () => {
		const testCaseDir = path.join(testDirectory, "syncRunnerAsyncReturns");
		const log = executeFuzzTest(true, false, testCaseDir);
		expect(log.trim()).toContain(AsyncInfo.trim());
	});
	it("Expect no hint due to strict synchronous return values", () => {
		const testCaseDir = path.join(testDirectory, "syncRunnerSyncReturns");
		const log = executeFuzzTest(true, false, testCaseDir);
		expect(log.includes(SyncInfo)).toBeFalsy();
		expect(log.includes(AsyncInfo)).toBeFalsy();
	});
});

describe("Execute a async runner", () => {
	it("Expect no hint due to async and sync return values", () => {
		const testCaseDir = path.join(testDirectory, "asyncRunnerMixedReturns");
		const log = executeFuzzTest(false, false, testCaseDir);
		expect(log.includes(SyncInfo)).toBeFalsy();
		expect(log.includes(AsyncInfo)).toBeFalsy();
	});
	it("Expect a hint due to exclusively sync return values", () => {
		const testCaseDir = path.join(testDirectory, "asyncRunnerSyncReturns");
		const log = executeFuzzTest(false, false, testCaseDir);
		expect(log.trim()).toContain(SyncInfo.trim());
	});
	it("Expect no hint due to strict asynchronous return values", () => {
		const testCaseDir = path.join(testDirectory, "asyncRunnerAsyncReturns");
		const log = executeFuzzTest(false, false, testCaseDir);
		expect(log.includes(SyncInfo)).toBeFalsy();
		expect(log.includes(AsyncInfo)).toBeFalsy();
	});
});

function executeFuzzTest(sync, verbose, dir) {
	let options = ["jazzer", "fuzz"];
	// Specify mode
	if (sync) options.push("--sync");
	options.push("--");
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const process = spawnSync("npx", options, {
		stdio: "pipe",
		cwd: dir,
		shell: true,
		windowsHide: true,
	});
	let stdout = process.output.toString();
	if (verbose) console.log(stdout);
	return stdout;
}
