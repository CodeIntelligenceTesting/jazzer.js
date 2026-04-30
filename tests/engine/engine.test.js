/*
 * Copyright 2026 Code Intelligence GmbH
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

const {
	cleanCrashFilesIn,
	FuzzingExitCode,
	FuzzTestBuilder,
	JestRegressionExitCode,
	TimeoutExitCode,
} = require("../helpers.js");

describe("Engine selection", () => {
	const testDirectory = __dirname;
	const jestProjectDirectory = path.join(testDirectory, "jest_project");

	beforeEach(async () => {
		await cleanCrashFilesIn(testDirectory);
		await cleanCrashFilesIn(jestProjectDirectory);
	});

	describe("CLI fuzzing", () => {
		it("runs with the LibAFL backend", () => {
			const fuzzTest = new FuzzTestBuilder()
				.dir(testDirectory)
				.fuzzEntryPoint("fuzz")
				.disableBugDetectors([".*"])
				.engine("afl")
				.runs(250)
				.seed(1337)
				.build()
				.execute();

			expect(fuzzTest.stderr).not.toContain("Unknown fuzzing engine");
		});

		it("rejects unsupported libFuzzer options in LibAFL mode", () => {
			const fuzzTest = new FuzzTestBuilder()
				.dir(testDirectory)
				.fuzzEntryPoint("fuzz")
				.disableBugDetectors([".*"])
				.engine("afl")
				.forkMode(1)
				.runs(1)
				.build();

			expect(() => fuzzTest.execute()).toThrow(FuzzingExitCode);
		});

		it("fails fast on asynchronous hangs in LibAFL mode", async () => {
			const fuzzTest = new FuzzTestBuilder()
				.dir(testDirectory)
				.fuzzEntryPoint("timeout_async")
				.disableBugDetectors([".*"])
				.engine("afl")
				.runs(1)
				.timeout(200)
				.build();

			expect(() => fuzzTest.execute()).toThrow(TimeoutExitCode);
			expect(fuzzTest.stderr).toContain("Exceeded timeout");
			const crashFiles = await cleanCrashFilesIn(testDirectory);
			expect(crashFiles).toHaveLength(1);
			expect(crashFiles[0]).toContain("timeout-");
		});

		it("fails fast on synchronous hangs in LibAFL mode", async () => {
			const fuzzTest = new FuzzTestBuilder()
				.dir(testDirectory)
				.fuzzEntryPoint("timeout_sync")
				.disableBugDetectors([".*"])
				.engine("afl")
				.sync(true)
				.runs(1)
				.timeout(200)
				.build();

			expect(() => fuzzTest.execute()).toThrow(TimeoutExitCode);
			expect(fuzzTest.stderr).toContain("Exceeded timeout");
			const crashFiles = await cleanCrashFilesIn(testDirectory);
			expect(crashFiles).toHaveLength(1);
			expect(crashFiles[0]).toContain("timeout-");
		});
	});

	describe("Jest integration", () => {
		it("runs fuzzing mode with the LibAFL backend", async () => {
			const fuzzTest = new FuzzTestBuilder()
				.dir(jestProjectDirectory)
				.disableBugDetectors([".*"])
				.engine("afl")
				.jestRunInFuzzingMode(true)
				.jestTestFile("jest.fuzz.js")
				.jestTestName("afl engine smoke finding")
				.runs(500)
				.build();

			expect(() => fuzzTest.execute()).toThrow(JestRegressionExitCode);
			expect(fuzzTest.stdout + fuzzTest.stderr).toContain(
				"AFL engine smoke finding",
			);
			await cleanCrashFilesIn(jestProjectDirectory);
		});

		it("surfaces timeout failures in Jest fuzzing mode", async () => {
			const fuzzTest = new FuzzTestBuilder()
				.dir(jestProjectDirectory)
				.disableBugDetectors([".*"])
				.engine("afl")
				.jestRunInFuzzingMode(true)
				.jestTestFile("jest.fuzz.js")
				.jestTestName("afl engine timeout finding")
				.timeout(200)
				.runs(1)
				.build();

			expect(() => fuzzTest.execute()).toThrow(TimeoutExitCode);
			expect(fuzzTest.stderr).toContain("Exceeded timeout");
			const crashFiles = await cleanCrashFilesIn(jestProjectDirectory);
			expect(crashFiles).toHaveLength(1);
			expect(crashFiles[0]).toContain("timeout-");
		});
	});
});
