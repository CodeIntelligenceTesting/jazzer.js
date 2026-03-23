/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const fs = require("fs");
const path = require("path");

const {
	cleanCrashFilesIn,
	FuzzTestBuilder,
	FuzzingExitCode,
} = require("../helpers");

describe("Command injection", () => {
	const bugDetectorDirectory = path.join(__dirname, "command-injection");
	const friendlyFilePath = path.join(bugDetectorDirectory, "FRIENDLY");

	// Delete files created by the tests.
	beforeEach(async () => {
		fs.rmSync(friendlyFilePath, { force: true });
		await cleanCrashFilesIn(bugDetectorDirectory);
	});

	it("exec with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
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
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("execFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("execFile with EVIL file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
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
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("execFileFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("execFileSync with EVIL file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
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
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("execFileSyncFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("spawn with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
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
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("spawnFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("spawnSync with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
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
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("spawnSyncFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("fork with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
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
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("forkFRIENDLY")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});
});

describe("Invalid arguments", () => {
	const bugDetectorDirectory = path.join(__dirname, "command-injection");
	const errorMessage = /TypeError: The ".*" argument must be of type string./;

	it("invalid args to exec", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("execInvalid")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => fuzzTest.execute()).toThrow();
		expect(fuzzTest.stderr).toMatch(errorMessage);
	});
});
