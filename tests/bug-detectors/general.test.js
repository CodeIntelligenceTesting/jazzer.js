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

const {
	FuzzTestBuilder,
	FuzzingExitCode,
	JestRegressionExitCode,
} = require("../helpers.js");
const path = require("path");
const fs = require("fs");

describe("General tests", () => {
	const bugDetectorDirectory = path.join(__dirname, "general");
	const friendlyFilePath = path.join(bugDetectorDirectory, "FRIENDLY");
	const evilFilePath = path.join(bugDetectorDirectory, "jaz_zer");
	const errorPattern =
		/Command Injection in execSync\(\): called with 'jaz_zer'/g;

	function expectErrorToBePrintedOnce(fuzzTest) {
		const matches = fuzzTest.stderr.match(errorPattern);
		expect(matches).toBeTruthy();
		expect(matches.length).toBe(1);
	}

	// Delete files created by the tests.
	beforeEach(() => {
		fs.rmSync(friendlyFilePath, { force: true });
		fs.rmSync(evilFilePath, { force: true });
		fs.rmSync("../jaz_zer", { force: true, recursive: true });
	});

	it("Call with EVIL string; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.fuzzEntryPoint("CallOriginalEvilAsync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with EVIL string; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("CallOriginalEvilSync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expectErrorToBePrintedOnce(fuzzTest);
	});

	it("Call with FRIENDLY string; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("CallOriginalFriendlyAsync")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Call with FRIENDLY string; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("CallOriginalFriendlySync")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Call with EVIL string; With done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallback")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expectErrorToBePrintedOnce(fuzzTest);
	});

	it("Call with EVIL string; With done callback; With try/catch", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallbackWithTryCatch")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expectErrorToBePrintedOnce(fuzzTest);
	});

	it("Call with EVIL string; With done callback; With timeout", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallbackWithTimeout")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(
			process.platform === "win32" ? JestRegressionExitCode : FuzzingExitCode,
		);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with EVIL string; With done callback; With timeout; With try/catch", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("CallOriginalEvilDoneCallbackWithTimeoutWithTryCatch")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Call with FRIENDLY string; With done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("CallOriginalFriendlyDoneCallback")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Fork mode: Call with EVIL string; SYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.error(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions",
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalEvil")
			.dir(bugDetectorDirectory)
			.runs(200)
			.forkMode(3)
			.build();
		fuzzTest.execute(); // fork mode doesn't throw errors
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Fork mode: Call with FRIENDLY string; SYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.error(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions",
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalFriendly")
			.dir(bugDetectorDirectory)
			.runs(200)
			.forkMode(3)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Fork mode: Call with EVIL string; ASYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.error(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions",
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalEvilAsync")
			.dir(bugDetectorDirectory)
			.runs(10)
			.forkMode(3)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
	});

	it("Fork mode: Call with FRIENDLY string; ASYNC", () => {
		// TODO: Fork mode does not work in the Windows-Server image used by github actions
		if (process.platform === "win32") {
			console.error(
				"// TODO: Fork mode does not work in the Windows-Server image used by github actions",
			);
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCallOriginalFriendlyAsync")
			.dir(bugDetectorDirectory)
			.runs(200)
			.forkMode(3)
			.build();
		fuzzTest.execute(); // fork mode doesn't throw errors
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Disable all bug detectors; Call with evil", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("DisableAllBugDetectors")
			.dir(bugDetectorDirectory)
			.disableBugDetectors([".*"])
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expect(fs.existsSync(evilFilePath)).toBeTruthy();
		expect(fs.existsSync("../jaz_zer")).toBeTruthy();
	});

	it("Jest: Test with EVIL command; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("^Command Injection Jest tests Call with EVIL command$")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(JestRegressionExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expectErrorToBePrintedOnce(fuzzTest);
	});

	it("Jest: Test with EVIL command; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName(
				"^Command Injection Jest tests Call with EVIL command ASYNC$",
			)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(JestRegressionExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expectErrorToBePrintedOnce(fuzzTest);
	});

	it("Jest: Test with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("^Command Injection Jest tests Call with FRIENDLY command$")
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Jest: Test with FRIENDLY command; ASYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName(
				"^Command Injection Jest tests Call with FRIENDLY command ASYNC$",
			)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Jest: Fuzzing mode; Test with EVIL command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName(
				"^Command Injection Jest tests Fuzzing mode with EVIL command$",
			)
			.jestRunInFuzzingMode(true)
			.runs(200)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(
			process.platform === "win32" ? JestRegressionExitCode : FuzzingExitCode,
		);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expectErrorToBePrintedOnce(fuzzTest);
	});

	it("Jest: Fuzzing mode; Test with FRIENDLY command", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName(
				"^Command Injection Jest tests Fuzzing mode with FRIENDLY command$",
			)
			.jestRunInFuzzingMode(true)
			.runs(200)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});

	it("Jest: Test with EVIL command; Done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName(
				"^Command Injection Jest tests Call with EVIL command and done callback$",
			)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(JestRegressionExitCode);
		expect(fs.existsSync(friendlyFilePath)).toBeFalsy();
		expectErrorToBePrintedOnce(fuzzTest);
	});

	it("Jest: Test with FRIENDLY command; Done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.dir(bugDetectorDirectory)
			.jestTestFile("tests.fuzz.js")
			.jestTestName(
				"^Command Injection Jest tests Call with FRIENDLY command and done callback$",
			)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(friendlyFilePath)).toBeTruthy();
	});
});
