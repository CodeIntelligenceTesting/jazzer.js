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

/* eslint no-undef: 0 */
const { FuzzTestBuilder, FuzzingExitCode } = require("../helpers.js");
const path = require("path");
const fs = require("fs");

describe("Command injection", () => {
	const bugDetectorDirectory = path.join(__dirname, "command-injection");
	const friendlyFilePath = path.join(bugDetectorDirectory, "FRIENDLY");

	// Delete files created by the tests.
	beforeEach(() => {
		fs.rmSync(friendlyFilePath, { force: true });
	});

	it("exec with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("execEVIL")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("exec with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("execFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("execFile with EVIL file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("execFileEVIL")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("execFile with FRIENDLY file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("execFileFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("execFileSync with EVIL file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("execFileSyncEVIL")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("execFileSync with FRIENDLY file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("execFileSyncFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("spawn with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("spawnEVIL")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("spawn with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("spawnFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("spawnSync with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("spawnSyncEVIL")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("spawnSync with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("spawnSyncFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("fork with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("forkEVIL")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("fork with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("forkFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});
});
