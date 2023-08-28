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
	TimeoutExitCode,
	WindowsExitCode,
	JestRegressionExitCode,
} = require("../helpers.js");
const path = require("path");
const fs = require("fs");

describe("Jest integration", () => {
	const projectDir = path.join(__dirname, "jest_project");
	const jestTestFile = "integration.fuzz";

	beforeEach(() => {
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
	});

	describe("Fuzzing mode", () => {
		const fuzzingExitCode =
			process.platform === "win32" ? WindowsExitCode : FuzzingExitCode;
		let fuzzTestBuilder;

		beforeEach(() => {
			fuzzTestBuilder = new FuzzTestBuilder()
				.dir(projectDir)
				.runs(1_000_000)
				.jestRunInFuzzingMode(true)
				.jestTestFile(jestTestFile + ".js");
		});

		describe("execute", () => {
			it("execute sync test", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute sync test")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(fuzzingExitCode);
			});

			it("execute async test", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(fuzzingExitCode);
			});

			it("execute async test returning a promise", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test returning a promise")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(fuzzingExitCode);
			});

			it("execute async test using a callback", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async test using a callback")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(fuzzingExitCode);
			});
		});

		describe("timeout", () => {
			it("execute async timeout test", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async timeout test")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(TimeoutExitCode);
				expect(fuzzTest.stderr).toContain("timeout after 5 seconds");
			});

			it("execute async timeout test with method timeout", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async timeout test with method timeout")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(TimeoutExitCode);
				expect(fuzzTest.stderr).toContain("timeout after 1 seconds");
			});

			it("execute async timeout test using a callback", () => {
				const fuzzTest = fuzzTestBuilder
					.jestTestName("execute async timeout test using a callback")
					.build();
				expect(() => {
					fuzzTest.execute();
				}).toThrow(TimeoutExitCode);
				expect(fuzzTest.stderr).toContain("timeout after 1 seconds");
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
				}).toThrow(fuzzingExitCode);
				expect(fuzzTest.stderr).toContain("the function was mocked");
			});
		});
	});

	describe("Regression mode", () => {
		let regressionTestBuilder;
		beforeEach(() => {
			regressionTestBuilder = new FuzzTestBuilder()
				.dir(projectDir)
				.jestTestFile(jestTestFile + ".js");
		});

		describe("execute", () => {
			it("execute sync test", () => {
				regressionTestBuilder
					.jestTestName("execute sync test")
					.build()
					.execute();
			});

			it("execute async test", () => {
				regressionTestBuilder
					.jestTestName("execute async test")
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
					.jestTestName("execute async timeout test")
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
		});

		describe("Run modes", () => {
			it.concurrent("only", () => {
				const fuzzTest = new FuzzTestBuilder()
					.dir(projectDir)
					.verbose()
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
					.verbose()
					.build()
					.execute();
				expect(fuzzTest.stdout).toContain("standard test called");
			});
		});
	});
});
