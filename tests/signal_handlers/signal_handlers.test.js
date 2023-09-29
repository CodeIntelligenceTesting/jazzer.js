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

const { FuzzTestBuilder, describeSkipOnPlatform } = require("../helpers.js");
const path = require("path");
const { cleanCrashFilesIn } = require("../helpers");

// Signal handling in Node.js on Windows is only rudimentary supported.
// Specifically using `process.kill`, like the test does to interrupt itself,
// will unconditionally terminate the process. The signal processing works in
// manual tests, though.
const describe = describeSkipOnPlatform("win32");

describe("SIGINT handlers", () => {
	let fuzzTestBuilder;

	beforeEach(async () => {
		const testProjectDir = path.join(__dirname, "SIGINT");
		fuzzTestBuilder = new FuzzTestBuilder()
			.runs(20000)
			.dir(testProjectDir)
			.coverage(true)
			.verbose(true);
		await cleanCrashFilesIn(testProjectDir);
	});

	describe("in standalone fuzzing mode", () => {
		it("stop sync fuzzing on SIGINT", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(true)
				.fuzzEntryPoint("SIGINT_SYNC")
				.build();
			fuzzTest.execute();
			expectSigintOutput(fuzzTest);
		});
		it("stop async fuzzing on SIGINT", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(false)
				.fuzzEntryPoint("SIGINT_ASYNC")
				.build();
			fuzzTest.execute();
			expectSigintOutput(fuzzTest);
		});
	});

	describe("in Jest fuzzing mode", () => {
		it("stop sync fuzzing on SIGINT", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Sync$")
				.jestRunInFuzzingMode(true)
				.build();
			fuzzTest.execute();
			expectSigintOutput(fuzzTest);
		});
		it("stop async fuzzing on SIGINT", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Async$")
				.jestRunInFuzzingMode(true)
				.build();
			fuzzTest.execute();
			expectSigintOutput(fuzzTest);
		});
	});
});

describe("SIGSEGV handlers", () => {
	let fuzzTestBuilder;
	const errorMessage = "== Segmentation Fault";

	beforeEach(async () => {
		const testProjectDir = path.join(__dirname, "SIGSEGV");
		fuzzTestBuilder = new FuzzTestBuilder()
			.runs(20000)
			.dir(testProjectDir)
			.coverage(true);
		await cleanCrashFilesIn(testProjectDir);
	});

	describe("in standalone fuzzing mode", () => {
		it("stop sync fuzzing on SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(true)
				.fuzzEntryPoint("SIGSEGV_SYNC")
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectSignalMessagesLogged(fuzzTest);
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop async fuzzing on SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(false)
				.fuzzEntryPoint("SIGSEGV_ASYNC")
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectSignalMessagesLogged(fuzzTest);
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop fuzzing on native SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(true)
				.fuzzEntryPoint("NATIVE_SIGSEGV_SYNC")
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop fuzzing on native async SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(false)
				.fuzzEntryPoint("NATIVE_SIGSEGV_ASYNC")
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
	});

	describe("in Jest fuzzing mode", () => {
		it("stop sync fuzzing on SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Sync$")
				.jestRunInFuzzingMode(true)
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectSignalMessagesLogged(fuzzTest);
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop async fuzzing on SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Async$")
				.jestRunInFuzzingMode(true)
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectSignalMessagesLogged(fuzzTest);
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop sync fuzzing on native SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Native$")
				.jestRunInFuzzingMode(true)
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop async fuzzing on native SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Native Async$")
				.jestRunInFuzzingMode(true)
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			expectFuzzingStopped(fuzzTest);
			expectErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
	});
});

function expectSignalMessagesLogged(fuzzTest) {
	expect(fuzzTest.stdout).toContain("kill with signal");
}

function expectFuzzingStopped(fuzzTest) {
	// Count how many times "Signal has not stopped the fuzzing process" has been printed.
	const matches = fuzzTest.stdout.match(
		/Signal has not stopped the fuzzing process/g,
	);
	const signalNotStoppedMessageCount = matches ? matches.length : 0;

	// In the GH pipeline the process does not immediately stop after receiving a signal.
	// So we check that the message has been printed not more than 1k times out of 19k (the signal
	// is sent after 1k runs, with 20k runs in total).
	expect(signalNotStoppedMessageCount).toBeLessThan(1000);
}

function expectCoverageReport(fuzzTest) {
	// We asked for a coverage report. Here we only look for the universal part of its header.
	// Jest prints to stdout.
	expect(fuzzTest.stdout).toContain(
		"| % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s",
	);
}

function expectDebugInformation(fuzzTest) {
	expect(fuzzTest.stderr).toContain("DEBUG: [Hook] Summary:");
}

function expectNoCrashFileLogged(fuzzTest) {
	expect(fuzzTest.stderr).not.toContain("Test unit written to ");
}

function expectErrorAndCrashFileLogged(fuzzTest, errorMessage) {
	expect(fuzzTest.stderr).toContain(errorMessage);
	expect(fuzzTest.stderr).toContain("Test unit written to ");
}

function expectSigintOutput(fuzzTest) {
	expectNoCrashFileLogged(fuzzTest);
	expectDebugInformation(fuzzTest);
	expectCoverageReport(fuzzTest);
	expectSignalMessagesLogged(fuzzTest);
	expectFuzzingStopped(fuzzTest);
}
