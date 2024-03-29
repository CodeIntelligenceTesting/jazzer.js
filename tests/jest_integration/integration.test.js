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

const fs = require("fs");
const path = require("path");

const {
	FuzzTestBuilder,
	JestRegressionExitCode,
	TimeoutExitCode,
	cleanCrashFilesIn,
} = require("../helpers.js");

describe("Jest integration", () => {
	const projectDir = path.join(__dirname, "jest_project");
	const jestTestFile = "integration.fuzz";
	const expectCrashFileIn = expectCrashFileInProject(projectDir);

	beforeEach(cleanupProjectFiles(projectDir, jestTestFile));

	describe("Fuzzing mode", () => {
		let fuzzTestBuilder;

		beforeEach(() => {
			fuzzTestBuilder = new FuzzTestBuilder()
				.dir(projectDir)
				.runs(1_000_000)
				.jestRunInFuzzingMode(true)
				.jestTestFile(jestTestFile + ".js");
		});

		describe("execute", () => {
			it("execute sync test", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute sync test")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_sync_test");
			});

			it("execute async test", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_async_test");
			});

			it("execute async test returning a promise", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test returning a promise")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_async_test_returning_a_promise");
			});

			it("execute async test using a callback", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test using a callback")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_async_test_using_a_callback");
			});

			it("single fuzz test without name pattern", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestFile("integration.fuzz.js")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
			});

			it("print corpus directories", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute sync test")
					.runs(1)
					.build();
				try {
					fuzzTest.execute();
				} catch (ignored) {
					// ignored
				}
				expect(fuzzTest.stderr).toContain("INFO: using inputs from:");
			});
		});

		describe("timeout", () => {
			it("execute async timeout test", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async timeout test plain")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(TimeoutExitCode);
				assertTimeoutMessageLogged(fuzzTest, 5);
				await expectCrashFileIn("execute_async_timeout_test_plain");
			});

			it("execute async timeout test with method timeout", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async timeout test with method timeout")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(TimeoutExitCode);
				assertTimeoutMessageLogged(fuzzTest, 1);
				await expectCrashFileIn(
					"execute_async_timeout_test_with_method_timeout",
				);
			});

			it("execute async timeout test using a callback", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async timeout test using a callback")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(TimeoutExitCode);
				assertTimeoutMessageLogged(fuzzTest, 1);
				await expectCrashFileIn("execute_async_timeout_test_using_a_callback");
			});
		});

		describe("mix features", () => {
			it("honor test name pattern", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("honor test name pattern$")
					.runs(1)
					.build()
					.execute();
				expect(fuzzTest.stderr).not.toContain(
					"This test should not be executed!",
				);
				expect(fuzzTest.stderr).toContain("1 passed");
			});

			it("execute a mocked test", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("mock test function")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				expect(fuzzTest.stderr).toContain("the function was mocked");
			});

			it("load by mapped module name", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("load by mapped module name")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
			});

			it("print proper stacktrace", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute sync test")
					.asJson()
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				const result = JSON.parse(fuzzTest.stdout);
				expect(result.numFailedTests).toBe(1);

				const lines = firstFailureMessage(result).split("\n");
				expect(lines).toHaveLength(3);
				expect(lines[0]).toEqual("Error: Welcome to Awesome Fuzzing!");
				expect(lines[1]).toMatch(
					/at Object\.Error \[as fuzzMe] \(.*target\.js:\d+:\d+\)/,
				);
				expect(lines[2]).toMatch(
					/at fuzzMe \(.*integration\.fuzz\.js:\d+:\d+\)/,
				);
			});
		});

		describe("run modes", () => {
			it.concurrent("only", () => {
				const fuzzTest = new FuzzTestBuilder()
					.dir(projectDir)
					.jestTestName("Run mode only and standard")
					.jestTestFile("run-mode-only.fuzz.js")
					.jestRunInFuzzingMode(true)
					.runs(1)
					.build()
					.execute();
				expect(fuzzTest.stdout).toContain("only test called");
			});

			it("skipped", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("Run mode skip and standard")
					.runs(1)
					.logTestOutput()
					.build()
					.execute();
				expect(fuzzTest.stdout).toContain("standard test called");
			});
		});
	});

	describe("Regression mode", () => {
		const regressionTestBuilder = new FuzzTestBuilder()
			.dir(projectDir)
			.jestTestFile(jestTestFile + ".js");

		describe("execute", () => {
			it("execute sync test", () => {
				regressionTestBuilder
					.jestTestName("execute sync test")
					.build()
					.execute();
			});

			it("execute async test plain", () => {
				regressionTestBuilder
					.jestTestName("execute async test plain")
					.build()
					.execute();
			});

			it("execute async test returning a promise", () => {
				regressionTestBuilder
					.jestTestName("execute async test returning a promise")
					.build()
					.execute();
			});

			it("execute async test using a callback", () => {
				regressionTestBuilder
					.jestTestName("execute async test using a callback")
					.build()
					.execute();
			});
		});

		describe("timeout", () => {
			it("execute async timeout test", () => {
				const fuzzTest = regressionTestBuilder
					.jestTestName("execute async timeout test plain")
					.asJson()
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				expect(fuzzTest.stderr).toContain("Exceeded timeout");
			});

			it("execute async timeout test with method timeout", () => {
				const fuzzTest = regressionTestBuilder
					.jestTestName("execute async timeout test with method timeout")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				expect(fuzzTest.stderr).toContain("Exceeded timeout");
			});

			it("execute async timeout test using a callback", () => {
				const fuzzTest = regressionTestBuilder
					.jestTestName("execute async timeout test using a callback")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				expect(fuzzTest.stderr).toContain("Exceeded timeout");
			});
		});

		describe("mix features", () => {
			it("honor test name pattern", () => {
				// Using a "$" suffix, like some IDEs, should also work in regression
				// mode and only execute the specific test.
				const fuzzTest = regressionTestBuilder
					.jestTestName("honor test name pattern$")
					.build()
					.execute();
				expect(fuzzTest.stderr).not.toContain(
					"This test should not be executed!",
				);
				expect(fuzzTest.stderr).toContain("1 passed");
			});

			it("execute a mocked test", () => {
				const fuzzTest = regressionTestBuilder
					.jestTestName("mock test function")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				expect(fuzzTest.stderr).toContain("the function was mocked");
			});

			it("load by mapped module name", () => {
				regressionTestBuilder
					.jestTestName("load by mapped module name")
					.build()
					.execute();
			});

			it("print proper stacktrace", () => {
				const fuzzTest = regressionTestBuilder
					.jestTestName("execute async timeout test plain")
					.asJson()
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);

				const result = JSON.parse(fuzzTest.stdout);
				const stackFrames = firstFailureMessage(result)
					.split("\n")
					.filter((line) => line.startsWith("    at"));
				expect(stackFrames).toHaveLength(10);
			});

			it("prioritize finding over error", () => {
				const fuzzTest = regressionTestBuilder
					.jestTestName("prioritize finding over error")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				expect(fuzzTest.stderr).toContain("Finding reported!");
				expect(fuzzTest.stderr).not.toContain(
					"This error should not be reported!",
				);
			});
		});

		describe("Run modes", () => {
			it.concurrent("only", () => {
				const fuzzTest = new FuzzTestBuilder()
					.dir(projectDir)
					.jestTestName("Run mode only and standard")
					.jestTestFile("run-mode-only.fuzz.js")
					.build()
					.execute();
				expect(fuzzTest.stdout).toContain("only test called");
			});

			it.concurrent("skipped", () => {
				const fuzzTest = new FuzzTestBuilder()
					.dir(projectDir)
					.jestTestFile(jestTestFile + ".js")
					.jestTestName("Run mode skip and standard")
					.build()
					.execute();
				expect(fuzzTest.stdout).toContain("standard test called");
			});
		});
	});

	describe("List all fuzz tests", () => {
		const listFuzzTestNamesTestBuilder = new FuzzTestBuilder()
			.dir(projectDir)
			.listFuzzTestNames()
			.jestTestFile(jestTestFile + ".js");

		it("lists fuzz tests", () => {
			const listFuzzTestNames = listFuzzTestNamesTestBuilder.build();

			listFuzzTestNames.execute();

			expect(listFuzzTestNames.stdout).toContain(
				"Jest Integration execute sync test",
			);
			expect(listFuzzTestNames.stdout).toContain(
				"Run mode skip and standard standard test",
			);
		});

		it("filters fuzz tests by name", () => {
			const listFuzzTestNames = listFuzzTestNamesTestBuilder
				.listFuzzTestNamesPattern("sync test")
				.build();

			listFuzzTestNames.execute();

			expect(listFuzzTestNames.stdout).toContain(
				"Jest Integration execute sync test",
			);
			expect(listFuzzTestNames.stdout).not.toContain(
				"Run mode skip and standard standard test",
			);
		});

		it("filters fuzz tests by describe name", () => {
			const listFuzzTestNames = listFuzzTestNamesTestBuilder
				.listFuzzTestNamesPattern("Jest")
				.build();

			listFuzzTestNames.execute();

			expect(listFuzzTestNames.stdout).toContain(
				"Jest Integration execute sync test",
			);
			expect(listFuzzTestNames.stdout).not.toContain(
				"Run mode skip and standard standard test",
			);
		});

		it("prints nothing else on stdout", () => {
			const listFuzzTestNames = listFuzzTestNamesTestBuilder
				.listFuzzTestNamesPattern("__NOT_AN_ACTUAL_TESTNAME__")
				.build();

			listFuzzTestNames.execute();

			expect(listFuzzTestNames.stdout).toBe("");
		});
	});
});

describe("Jest TS integration", () => {
	const projectDir = path.join(__dirname, "jest_project_ts");
	const jestTsTestFile = "integration.fuzz";
	const expectCrashFileIn = expectCrashFileInProject(projectDir);

	beforeEach(cleanupProjectFiles(projectDir, jestTsTestFile));

	describe("Fuzzing mode", () => {
		let fuzzTestBuilder;

		beforeEach(() => {
			fuzzTestBuilder = new FuzzTestBuilder()
				.dir(projectDir)
				.runs(1_000_000)
				.jestRunInFuzzingMode(true)
				.jestTestFile(jestTsTestFile + ".ts");
		});

		describe("execute", () => {
			it("execute sync test", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute sync test")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_sync_test");
			});

			it("execute async test", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_async_test");
			});

			it("execute async test returning a promise", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test returning a promise")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_async_test_returning_a_promise");
			});

			it("execute async test using a callback", async () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test using a callback")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(JestRegressionExitCode);
				await expectCrashFileIn("execute_async_test_using_a_callback");
			});
		});
	});

	describe("Regression mode", () => {
		const regressionTestBuilder = new FuzzTestBuilder()
			.dir(projectDir)
			.jestTestFile(jestTsTestFile + ".ts");

		describe("mixed features", () => {
			it("cover implicit else branch", async () => {
				regressionTestBuilder
					.jestTestName("execute sync test")
					.coverage()
					.build()
					.execute();
				const coverage = readCoverageOf(projectDir, "target.ts");
				// Expect that every branch has two entries, one for the if and one for the else branch.
				Object.keys(coverage.b).forEach((branch) => {
					expect(coverage.b[branch]).toHaveLength(2);
				});
			});
		});
	});
});

// Deflake the "timeout after N seconds" test to be more tolerant to small variations of N (+-1).
function assertTimeoutMessageLogged(fuzzTest, expectedTimeout) {
	const timeoutValue = parseInt(
		fuzzTest.stderr.match(/timeout after (\d+) seconds/)[1],
	);
	// expect the actual timeout to be in the range [expectedTimeout - 1, expectedTimeout + 1]
	expect(timeoutValue).toBeGreaterThanOrEqual(expectedTimeout - 1);
	expect(timeoutValue).toBeLessThanOrEqual(expectedTimeout + 1);
}

function firstFailureMessage(result) {
	return result.testResults[0].assertionResults.filter(
		(result) => result.status === "failed",
	)[0].failureMessages[0];
}

function expectCrashFileInProject(projectDir) {
	return (crashDir) => async () => {
		const crashFiles = await cleanCrashFilesIn(projectDir);
		expect(crashFiles).toHaveLength(1);
		expect(crashFiles[0]).toContain(crashDir);
	};
}

function cleanupProjectFiles(projectDir, jestTestFile) {
	return () => {
		fs.rmSync(path.join(projectDir, ".jazzerjsrc.json"), {
			force: true,
		});
		fs.rmSync(path.join(projectDir, ".cifuzz-corpus"), {
			force: true,
			recursive: true,
		});
		fs.rmSync(path.join(projectDir, jestTestFile), {
			force: true,
			recursive: true,
		});
	};
}

function readCoverageOf(projectDir, fileName) {
	const report = JSON.parse(
		fs.readFileSync(
			path.join(projectDir, "coverage", "coverage-final.json"),
			"utf-8",
		),
	);
	for (let path of Object.keys(report)) {
		if (path.endsWith(fileName)) {
			return report[path];
		}
	}
	throw new Error("Could not find coverage for " + fileName);
}
