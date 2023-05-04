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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FuzzTestBuilder } = require("./helpers.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// This is used to distinguish an error thrown during fuzzing from other errors, such as wrong
// `fuzzEntryPoint` (which would return a "1")
const FuzzingErrorMessage = "77";

describe("Command Injection", () => {
	const bugDetectorDirectory = path.join(__dirname, "command-injection");
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const evilFilePath = path.join(bugDetectorDirectory, "EVIL");
	const friendlyFilePath = path.join(bugDetectorDirectory, "FRIENDLY");

	// Delete files created by the tests.
	beforeEach(() => {
		fs.rmSync(evilFilePath, { force: true });
		fs.rmSync(friendlyFilePath, { force: true });
	});

	it("Call with EVIL string; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with EVIL string; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(true)
			.fuzzEntryPoint("CallOriginalEvilSync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with FRIENDLY string; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CallOriginalFriendlyAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Call with FRIENDLY string; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(true)
			.fuzzEntryPoint("CallOriginalFriendlySync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Call with EVIL string; With done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallback")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with EVIL string; With done callback; With try/catch", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallbackWithTryCatch")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with EVIL string; With done callback; With timeout", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallbackWithTimeout")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with EVIL string; With done callback; With timeout; With try/catch", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallbackWithTimeoutWithTryCatch")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with FRIENDLY string; With done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CallOriginalFriendlyDoneCallback")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Fork mode: Call with EVIL string; SYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.log(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions"
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalEvil")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.runs(200)
			.forkMode(3)
			.build();
		fuzzTest.execute(); // fork mode doesn't throw errors
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Fork mode: Call with FRIENDLY string; SYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.log(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions"
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalFriendly")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.runs(200)
			.forkMode(3)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Fork mode: Call with EVIL string; ASYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.log(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions"
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalEvilAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.runs(200)
			.forkMode(3)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Fork mode: Call with FRIENDLY string; ASYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.log(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions"
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalFriendlyAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.runs(200)
			.forkMode(3)
			.build();
		fuzzTest.execute(); // fork mode doesn't throw errors
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Jest: Test with EVIL command; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Call with EVIL command")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Jest: Test with EVIL command; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Call with EVIL command ASYNC")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Jest: Test with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Call with FRIENDLY command")
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Jest: Test with FRIENDLY command; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Call with FRIENDLY command ASYNC")
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Jest: Fuzzing mode; Test with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Fuzzing mode with EVIL command")
			.jestRunInFuzzingMode(true)
			.runs(200)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Jest: Fuzzing mode; Test with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Fuzzing mode with FRIENDLY command")
			.jestRunInFuzzingMode(true)
			.runs(200)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Jest: Test with EVIL command; Done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Call with EVIL command and done callback")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingErrorMessage);
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Jest: Test with FRIENDLY command; Done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Call with FRIENDLY command and done callback")
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(evilFilePath)).toBeFalsy();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});
});
