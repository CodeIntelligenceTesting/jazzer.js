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

const path = require("path");

const {
	FuzzTestBuilder,
	FuzzingExitCode,
	JestRegressionExitCode,
} = require("../helpers.js");

const bugDetectorDirectory = path.join(__dirname, "remote-code-execution");

const findingMessage = "Remote Code Execution using";
const okMessage = "can be called just fine";
let fuzzTestBuilder;

beforeEach(() => {
	fuzzTestBuilder = new FuzzTestBuilder()
		.runs(0)
		.dir(bugDetectorDirectory)
		.sync(true);
});

describe("CLI", () => {
	describe("eval ()", () => {
		it("Invocation without error", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("invocationWithoutError")
				.build()
				.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("Direct invocation", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("directInvocation")
				.sync(true)
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Indirect invocation", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("indirectInvocation")
				.sync(true)
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Indirect invocation using comma operator", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("indirectInvocationUsingCommaOperator")
				.sync(true)
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Indirect invocation through optional chaining", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("indirectInvocationThroughOptionalChaining")
				.sync(true)
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});
	});

	describe("Function constructor", () => {
		it("Invocation without error, without explicit constructor", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("functionNoErrorNoConstructor")
				.sync(true)
				.build()
				.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("Invocation without error", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("functionNoErrorWithConstructor")
				.sync(true)
				.build()
				.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("Direct invocation", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("functionError")
				.sync(true)
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Direct invocation using new", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("functionErrorNew")
				.sync(true)
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Target string in variable name - no error", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("functionWithArgNoError")
				.sync(true)
				.build()
				.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("With error - target string in last arg", () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint("functionWithArgError")
				.sync(true)
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});
	});
});

describe("Jest", () => {
	describe("eval", () => {
		it("Direct invocation", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("eval Direct invocation$")
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(JestRegressionExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Indirect invocation", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("eval Indirect invocation$")
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(JestRegressionExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Indirect invocation using comma operator", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("eval Indirect invocation using comma operator$")
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(JestRegressionExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Indirect invocation using optional chaining", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.verbose(true)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("eval Indirect invocation through optional chaining$")
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(JestRegressionExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("No error with absence of the target string", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("eval No error$")
				.build()
				.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});
	});

	describe("Function constructor", () => {
		it("No error", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("Function No error$")
				.build();
			fuzzTest.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("No error with constructor", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("Function No error with constructor$")
				.build();
			fuzzTest.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("With error", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("Function With error$")
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(JestRegressionExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("With error with constructor", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("Function With error with constructor$")
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(JestRegressionExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});

		it("Variable name containing target string should not throw", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("Function Target string in variable name - no error$")
				.build()
				.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});

		it("With variable, body contains target string - should throw", () => {
			const fuzzTest = fuzzTestBuilder
				.dryRun(false)
				.jestTestFile("tests.fuzz.js")
				.jestTestName("Function With error - target string in last arg$")
				.build();
			expect(() => {
				fuzzTest.execute();
			}).toThrowError(JestRegressionExitCode);
			expect(fuzzTest.stderr).toContain(findingMessage);
		});
	});
});
