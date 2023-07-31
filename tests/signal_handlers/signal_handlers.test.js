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

// Signal handling in Node.js on Windows is only rudimentary supported.
// Specifically using `process.kill`, like the test does to interrupt itself,
// will unconditionally terminate the process. The signal processing works in
// manual tests, though.
const describe = describeSkipOnPlatform("win32");

describe("SIGINT handlers", () => {
	let fuzzTestBuilder;

	beforeEach(() => {
		fuzzTestBuilder = new FuzzTestBuilder()
			.runs(20000)
			.dir(path.join(__dirname, "SIGINT"))
			.coverage(true)
			.verbose(true);
	});

	describe("in standalone fuzzing mode", () => {
		it("stop sync fuzzing on SIGINT", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(true)
				.fuzzEntryPoint("SIGINT_SYNC")
				.build();
			fuzzTest.execute();
			assertSignalMessagesLogged(fuzzTest);
		});
		it("stop async fuzzing on SIGINT", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(false)
				.fuzzEntryPoint("SIGINT_ASYNC")
				.build();
			fuzzTest.execute();
			assertSignalMessagesLogged(fuzzTest);
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
			assertSignalMessagesLogged(fuzzTest);
		});
		it("stop async fuzzing on SIGINT", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Async$")
				.jestRunInFuzzingMode(true)
				.build();
			fuzzTest.execute();
			assertSignalMessagesLogged(fuzzTest);
		});
	});
});

describe("SIGSEGV handlers", () => {
	let fuzzTestBuilder;
	const errorMessage = "= Segmentation Fault";

	beforeEach(() => {
		fuzzTestBuilder = new FuzzTestBuilder()
			.runs(20000)
			.dir(path.join(__dirname, "SIGSEGV"))
			.coverage(true)
			.verbose(true);
	});

	describe("in standalone fuzzing mode", () => {
		it("stop sync fuzzing on SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(true)
				.fuzzEntryPoint("SIGSEGV_SYNC")
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			assertSignalMessagesLogged(fuzzTest);
			assertErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop async fuzzing on SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.sync(false)
				.fuzzEntryPoint("SIGSEGV_ASYNC")
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			assertSignalMessagesLogged(fuzzTest);
			assertErrorAndCrashFileLogged(fuzzTest, errorMessage);
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
			assertSignalMessagesLogged(fuzzTest);
			assertErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
		it("stop async fuzzing on SIGSEGV", () => {
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Async$")
				.jestRunInFuzzingMode(true)
				.build();
			expect(() => fuzzTest.execute()).toThrowError();
			assertSignalMessagesLogged(fuzzTest);
			assertErrorAndCrashFileLogged(fuzzTest, errorMessage);
		});
	});
});

function assertSignalMessagesLogged(fuzzTest) {
	expect(fuzzTest.stdout).toContain("kill with signal");

	// We asked for a coverage report. Here we only look for the universal part of its header.
	expect(fuzzTest.stdout).toContain(
		"| % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s",
	);

	// Count how many times "Signal has not stopped the fuzzing process" has been printed.
	const matches = fuzzTest.stdout.match(
		/Signal has not stopped the fuzzing process/g,
	);
	const signalNotStoppedMessageCount = matches ? matches.length : 0;

	// In the GH pipeline the process does not immediately stop after receiving a signal.
	// So we check that the messas has been printed not more than 1k times out of 19k (the signal
	// is sent after 1k runs, with 20k runs in total).
	expect(signalNotStoppedMessageCount).toBeLessThan(1000);
}

function assertErrorAndCrashFileLogged(fuzzTest, errorMessage) {
	expect(fuzzTest.stdout).toContain(errorMessage);
	expect(fuzzTest.stderr).toContain("Test unit written to ");
}
