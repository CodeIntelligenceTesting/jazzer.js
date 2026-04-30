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

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
	cleanCrashFilesIn,
	FuzzingExitCode,
	FuzzTestBuilder,
	JestRegressionExitCode,
	TimeoutExitCode,
} = require("../helpers.js");

async function withTempGuidanceDirectory(callback) {
	const directory = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "jazzer-libafl-guidance-"),
	);
	try {
		return await callback(directory);
	} finally {
		await fs.promises.rm(directory, { force: true, recursive: true });
	}
}

function runLibAflCli(cwd, entryPoint, extraFuzzerOptions = []) {
	const proc = spawnSync(
		"npx",
		[
			"jazzer",
			"fuzz.js",
			"-f",
			entryPoint,
			"--engine=afl",
			"--sync",
			"--disable_bug_detectors=.*",
			"--",
			...extraFuzzerOptions,
		],
		{
			cwd,
			env: { ...process.env },
			shell: true,
			stdio: "pipe",
			windowsHide: true,
		},
	);
	return {
		status: proc.status,
		output: proc.stdout.toString() + proc.stderr.toString(),
	};
}

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
			expect(fuzzTest.stderr).toContain("[libafl::start] mode: fuzzing");
			expect(fuzzTest.stderr).toContain("[libafl::done] mode: fuzzing");
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

		it("supports regression mode in LibAFL mode", async () => {
			const corpusDirectory = path.join(testDirectory, "regression_corpus");
			await fs.promises.rm(corpusDirectory, { force: true, recursive: true });
			await fs.promises.mkdir(corpusDirectory, { recursive: true });
			await fs.promises.writeFile(
				path.join(corpusDirectory, "seed"),
				"afl-regression-hit",
			);

			try {
				const proc = spawnSync(
					"npx",
					[
						"jazzer",
						"fuzz",
						"-f",
						"regression",
						"--engine=afl",
						"--mode=regression",
						"--disable_bug_detectors=.*",
						"--",
						corpusDirectory,
					],
					{
						cwd: testDirectory,
						env: { ...process.env },
						shell: true,
						stdio: "pipe",
						windowsHide: true,
					},
				);

				expect(proc.status).toBe(Number(FuzzingExitCode));
				const output = proc.stdout.toString() + proc.stderr.toString();
				expect(output).toContain("[libafl::start] mode: regression");
				expect(output).toContain("AFL regression finding");
			} finally {
				await fs.promises.rm(corpusDirectory, {
					force: true,
					recursive: true,
				});
			}
		});

		it("finds integer comparisons with LibAFL compare guidance", async () => {
			await withTempGuidanceDirectory(async (directory) => {
				const corpusDirectory = path.join(directory, "numeric-corpus");
				await fs.promises.mkdir(corpusDirectory, { recursive: true });
				await fs.promises.writeFile(
					path.join(corpusDirectory, "seed"),
					Buffer.alloc(4),
				);

				const { status, output } = runLibAflCli(
					testDirectory,
					"guided_numeric",
					[
						corpusDirectory,
						"-runs=4000",
						"-seed=1337",
						"-max_len=16",
						`-artifact_prefix=${directory}${path.sep}`,
					],
				);

				expect(status).toBe(Number(FuzzingExitCode));
				expect(output).toContain("AFL numeric guidance finding");
			});
		});

		it("promotes equality targets into LibAFL tokens", async () => {
			await withTempGuidanceDirectory(async (directory) => {
				const corpusDirectory = path.join(directory, "equality-corpus");
				await fs.promises.mkdir(corpusDirectory, { recursive: true });
				await fs.promises.writeFile(path.join(corpusDirectory, "seed"), "");

				const { status, output } = runLibAflCli(
					testDirectory,
					"guided_equality",
					[
						corpusDirectory,
						"-runs=4000",
						"-seed=1441",
						"-max_len=32",
						`-artifact_prefix=${directory}${path.sep}`,
					],
				);

				expect(status).toBe(Number(FuzzingExitCode));
				expect(output).toContain("AFL equality guidance finding");
			});
		});

		it("promotes containment needles into LibAFL tokens", async () => {
			await withTempGuidanceDirectory(async (directory) => {
				const corpusDirectory = path.join(directory, "containment-corpus");
				await fs.promises.mkdir(corpusDirectory, { recursive: true });
				await fs.promises.writeFile(path.join(corpusDirectory, "seed"), "");

				const { status, output } = runLibAflCli(
					testDirectory,
					"guided_containment",
					[
						corpusDirectory,
						"-runs=4000",
						"-seed=1777",
						"-max_len=32",
						`-artifact_prefix=${directory}${path.sep}`,
					],
				);

				expect(status).toBe(Number(FuzzingExitCode));
				expect(output).toContain("AFL containment guidance finding");
			});
		});

		it("uses dictionaries with LibAFL token mutations", async () => {
			await withTempGuidanceDirectory(async (directory) => {
				const corpusDirectory = path.join(directory, "dictionary-corpus");
				const dictionaryPath = path.join(directory, "tokens.dict");
				await fs.promises.mkdir(corpusDirectory, { recursive: true });
				await fs.promises.writeFile(path.join(corpusDirectory, "seed"), "");
				await fs.promises.writeFile(dictionaryPath, '"from-dictionary"\n');

				const { status, output } = runLibAflCli(
					testDirectory,
					"dictionary_target",
					[
						corpusDirectory,
						"-runs=4000",
						"-seed=2333",
						"-max_len=32",
						`-dict=${dictionaryPath}`,
						`-artifact_prefix=${directory}${path.sep}`,
					],
				);

				expect(status).toBe(Number(FuzzingExitCode));
				expect(output).toContain("AFL dictionary guidance finding");
			});
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
