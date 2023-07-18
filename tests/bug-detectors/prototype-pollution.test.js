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

describe("Prototype Pollution", () => {
	const bugDetectorDirectory = path.join(__dirname, "prototype-pollution");

	it("{} Pollution", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("BaseObjectPollution")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("{} Pollution using square braces", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("BaseObjectPollutionWithSquareBraces")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("[] Pollution", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("ArrayObjectPollution")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Function Pollution", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("FunctionObjectPollution")
			.sync(true)
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain(
			"Prototype Pollution: Prototype of Function changed",
		);
	});

	it('"" Pollution', () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("StringObjectPollution")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain(
			"Prototype Pollution: Prototype of String changed",
		);
	});

	it("0 Pollution", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("NumberObjectPollution")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain(
			"Prototype Pollution: Prototype of Number changed",
		);
	});

	it("Boolean Pollution", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("BooleanObjectPollution")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain(
			"Prototype Pollution: Prototype of Boolean changed",
		);
	});

	it("Pollute using constructor.prototype", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("ConstructorPrototype")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain(
			"Prototype Pollution: a.__proto__ value is ",
		);
	});

	it("Test instrumentation and local pollution with single assignment", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("LocalPrototypePollution")
			.sync(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution: a.__proto__");
	});

	it("Test no instrumentation and polluting __proto__ of a class", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("PollutingAClass")
			.sync(true)
			.verbose(true)
			.build();
		fuzzTest.execute();
	});

	it("Instrumentation on and polluting __proto__ of a class", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("PollutingAClass")
			.sync(true)
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Instrumentation on with excluded exact match", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all-exclude-one.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("PollutingAClass")
			.sync(true)
			.verbose(true)
			.build();
		fuzzTest.execute();
	});

	it("Detect changed toString() of {}", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("ChangedToString")
			.sync(true)
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Detect deleted toString() of {}", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("DeletedToString")
			.sync(true)
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Two-stage prototype pollution with object creation", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("TwoStagePollutionWithObjectCreation")
			.sync(true)
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Async assignment instrumentation", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("AsyncAssignment")
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Async variable declaration instrumentation", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("AsyncVariableDeclaration")
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Equal assignments should be instrumented", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("EqualExpressionInstrumentation")
			.sync(true)
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	it("Equal variable declarations should be instrumented", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("EqualVariableDeclarationsInstrumentation")
			.sync(true)
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(FuzzingExitCode);
		expect(fuzzTest.stdout).toContain("Prototype Pollution");
	});

	// Challenge to the future developer: make this test pass!
	// it("Two-stage prototype pollution using instrumentation", () => {
	// 	const fuzzTest = new FuzzTestBuilder()
	// 		.customHooks([
	// 			path.join(bugDetectorDirectory, "instrument-all.config.js"),
	// 		])
	// 		.dir(bugDetectorDirectory)
	// 		.fuzzEntryPoint("TwoStagePollution")
	// 		.sync(true)
	// 		.verbose(true)
	// 		.build();
	// 	expect(() => {
	// 		fuzzTest.execute();
	// 	}).toThrowError(FuzzingExitCode);
	// 	expect(fuzzTest.stdout).toContain("Prototype Pollution");
	// });
});

describe("Prototype Pollution Jest tests", () => {
	const bugDetectorDirectory = path.join(__dirname, "prototype-pollution");

	it("PP pollution of Object", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.dryRun(true)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Pollution of Object")
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(JestRegressionExitCode);
		expect(fuzzTest.stderr).toContain(
			"Prototype Pollution: Prototype of Object changed",
		);
	});

	it("Instrumentation of assignment expressions", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Assignments")
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(JestRegressionExitCode);
		expect(fuzzTest.stderr).toContain(
			"Prototype Pollution: a.__proto__ value is",
		);
	});

	it("Instrumentation of variable declarations", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Variable declarations")
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(JestRegressionExitCode);
		expect(fuzzTest.stderr).toContain(
			"Prototype Pollution: a.__proto__ value is",
		);
	});

	it("Fuzzing mode pollution of Object", () => {
		const fuzzTest = new FuzzTestBuilder()
			.dir(bugDetectorDirectory)
			.dryRun(true)
			.jestRunInFuzzingMode(true)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Fuzzing mode pollution of Object")
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrowError(
			process.platform === "win32" ? JestRegressionExitCode : FuzzingExitCode,
		);
		expect(fuzzTest.stderr).toContain(
			"Prototype Pollution: Prototype of Object changed",
		);
	});

	it("Fuzzing mode instrumentation off - variable declaration", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.dryRun(true)
			.jestRunInFuzzingMode(true)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Variable declarations")
			.verbose(true)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow();
		expect(fuzzTest.stderr).toContain("[Prototype Pollution Configuration]");
	});
});

describe("Prototype Pollution instrumentation correctness tests", () => {
	const bugDetectorDirectory = path.join(__dirname, "prototype-pollution");
	const fuzzFile = "instrumentation-correctness-tests";

	it("Basic assignment", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("OnePlusOne")
			.fuzzFile(fuzzFile)
			.verbose(true)
			.build();
		fuzzTest.execute();
	});

	it("Assign to called lambda", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("LambdaAssignmentAndExecution")
			.fuzzFile(fuzzFile)
			.verbose(true)
			.build();
		fuzzTest.execute();
	});

	it("Assign to lambda and then execute", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.fuzzEntryPoint("LambdaAssignmentAndExecutionLater")
			.fuzzFile(fuzzFile)
			.verbose(true)
			.build();
		fuzzTest.execute();
	});

	it("Lambda variable declaration", () => {
		const fuzzTest = new FuzzTestBuilder()
			.customHooks([
				path.join(bugDetectorDirectory, "instrument-all.config.js"),
			])
			.dir(bugDetectorDirectory)
			.dryRun(false)
			.fuzzEntryPoint("LambdaVariableDeclaration")
			.fuzzFile(fuzzFile)
			.verbose(true)
			.build();
		fuzzTest.execute();
	});
});
