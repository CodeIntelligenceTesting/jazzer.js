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

describe("Command Injection", () => {
	const bugDetectorDirectory = path.join(__dirname, "CommandInjection");

	beforeEach(() => {
		// delete the files created by the tests
		fs.rmSync(bugDetectorDirectory + path.sep + "EVIL", {
			force: true,
		});
		fs.rmSync(bugDetectorDirectory + path.sep + "SAFE", {
			force: true,
		});
	});

	it("Expect a call to the original exec creating the EVIL file; ASYNC", async () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalEvilAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		let result;
		expect(() => {
			result = fuzzTest.execute();
		}).toThrow(); // we call the original exec with an evil command
		result;
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});

	it("Expect a call to the original exec creating the EVIL file; Done callback", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalEvilDoneCallback")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.runs(200)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(); // we call the original exec with an evil command
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});

	it("Expect a call to the original exec creating the SAFE file; ASYNC", async () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalSafeAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		fuzzTest.execute(); // we call the original exec with a safe command
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
	});

	it("Expect an error because 'touch EVIL' was found; no calls to the original exec are expected; ASYNC", async () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalEvilAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjectionSafe")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(); // we call the original exec with an evil command
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});

	it("Expect no calls to the original exec creating the SAFE file; ASYNC", async () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalSafeAsync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjectionSafe")
			.build();
		fuzzTest.execute(); // we call the original exec with a safe command
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
	});

	// The same tests as above but with calls to execSync
	it("Expect a call to the original exec creating the EVIL file; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalEvilAsyncCallingSync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(); // we call the original exec with an evil command
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});

	it("Expect a call to the original exec creating the SAFE file; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalSafeAsyncCallingSync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.build();
		fuzzTest.execute(); // we call the original exec with a safe command
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
	});

	it("Expect an error because 'touch EVIL' was found; no calls to the original exec are expected; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalEvilAsyncCallingSync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjectionSafe")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(); // we call the original exec with an evil command
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});

	it("Expect no calls to the original exec creating the SAFE file; SYNC", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("CommandInjectionCallOriginalSafeAsyncCallingSync")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjectionSafe")
			.build();
		fuzzTest.execute(); // we call the original exec with a safe command
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
	});

	// Fork mode returns no errors.
	it("Fork mode: Expect no errors, an EVIL file should be found; SYNC", () => {
		// TODO: Fork mode does not work on windows
		if (process.platform === "win32") {
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCommandInjectionCallOriginalEvil")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.runs(1000)
			.forkMode(3)
			.build();
		fuzzTest.execute(); // fork mode doesn't throw errors
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});

	it("Fork mode: Expect no errors, expect no calls to original exec; SYNC", () => {
		// TODO: Fork mode does not work on windows
		if (process.platform === "win32") {
			return;
		}
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.fuzzEntryPoint("ForkModeCommandInjectionCallOriginalEvil")
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjectionSafe")
			.runs(1000)
			.forkMode(3)
			.build();
		fuzzTest.execute(); // fork mode doesn't throw errors
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});

	it("Jest: Should fail, creating EVIL file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Should fail, creating EVIL file")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(); // we call the original exec with an evil command
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")
		).toBeTruthy();
	});

	it("Jest: Should not fail, creating SAFE file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Should not fail, creating SAFE file")
			.build();
		fuzzTest.execute();
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")).toBeFalsy();
	});

	it("Jest in fuzzing mode: Should fail, creating EVIL file", () => {
		const fuzzTest = new FuzzTestBuilder()
			.sync(false)
			.dir(bugDetectorDirectory)
			.bugDetectorActivationFlag("commandInjection")
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Fuzzing mode-- should fail and create EVIL file")
			.jestRunInFuzzingMode(true)
			.runs(1000)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(); // we call the original exec with an evil command
		expect(
			fs.existsSync(bugDetectorDirectory + path.sep + "EVIL")
		).toBeTruthy();
		expect(fs.existsSync(bugDetectorDirectory + path.sep + "SAFE")).toBeFalsy();
	});
});
