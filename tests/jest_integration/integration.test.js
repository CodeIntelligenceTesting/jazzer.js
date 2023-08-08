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
	WindowsExitCode,
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
		const fuzzTestBuilder = new FuzzTestBuilder()
			.dir(projectDir)
			.runs(1_000_000)
			.jestRunInFuzzingMode(true)
			.jestTestFile(jestTestFile + ".js");

		it("executes sync test", () => {
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

	describe("Regression mode", () => {
		const regressionTestBuilder = new FuzzTestBuilder()
			.dir(projectDir)
			.jestTestFile(jestTestFile + ".js");

		it("executes sync test", () => {
			const fuzzTest = regressionTestBuilder
				.jestTestName("execute sync test")
				.build()
				.execute();
		});

		it("execute async test", () => {
			const fuzzTest = regressionTestBuilder
				.jestTestName("execute async test")
				.build()
				.execute();
		});

		it("execute async test returning a promise", () => {
			const fuzzTest = regressionTestBuilder
				.jestTestName("execute async test returning a promise")
				.build()
				.execute();
		});

		it("execute async test using a callback", () => {
			const fuzzTest = regressionTestBuilder
				.jestTestName("execute async test using a callback")
				.build()
				.execute();
		});
	});
});
