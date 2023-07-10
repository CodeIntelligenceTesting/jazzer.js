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

/* eslint no-undef: 0, @typescript-eslint/no-var-requires: 0 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// current working directory
const testDirectory = path.join(process.cwd(), "sample_fuzz_test");
const defaultCoverageDirectory = path.join(testDirectory, "coverage");
const expectedCoverageDirectory = path.join(testDirectory, "expected_coverage");

const libFile = "lib.js";
const targetFile = "fuzz.js";
const testFile = "codeCoverage.fuzz.js";
const otherTestFile = "otherCodeCoverage.fuzz.ts";
const hookFile = "custom-hooks.js";

describe("Source code coverage reports", () => {
	describe("for regular fuzz targets", () => {
		it("expect no coverage reports", () => {
			executeFuzzTest(false, false, false, false, false);
			expect(defaultCoverageDirectory).not.toBeCreated();
		});

		it("want coverage, but no includes active. Expect no coverage reports", () => {
			executeFuzzTest(false, false, false, false, true);
			expect(defaultCoverageDirectory).not.toBeCreated();
		});

		it("want coverage in dry run mode, no custom hooks", () => {
			executeFuzzTest(true, true, true, false, true);
			expect(defaultCoverageDirectory).toBeCreated();
			const coverageJson = readCoverageJson(defaultCoverageDirectory);
			const expectedCoverage = readExpectedCoverage("fuzz+lib.json");
			expect(libFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(targetFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(hookFile).toHaveMissingCoverageIn(coverageJson);
		});

		it("want coverage in dry run mode, with custom hooks", () => {
			executeFuzzTest(true, true, true, true, true);
			expect(defaultCoverageDirectory).toBeCreated();
			const coverageJson = readCoverageJson(defaultCoverageDirectory);
			const expectedCoverage = readExpectedCoverage(
				"fuzz+lib+customHooks.json",
			);
			expect(libFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(targetFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(hookFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
		});

		it("want coverage, instrumentation enabled, with custom hooks", () => {
			executeFuzzTest(false, true, true, true, true);
			expect(defaultCoverageDirectory).toBeCreated();
			const coverageJson = readCoverageJson(defaultCoverageDirectory);
			const expectedCoverage = readExpectedCoverage(
				"fuzz+lib+customHooks.json",
			);
			expect(libFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(targetFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(hookFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
		});

		it("want coverage in a non-default directory, instrumentation enabled, with custom hooks", () => {
			const coverageDirectory = "coverage002";
			const coverageAbsoluteDirectory = path.join(
				testDirectory,
				coverageDirectory,
			);
			executeFuzzTest(false, true, true, true, true, coverageDirectory);
			expect(fs.existsSync(coverageAbsoluteDirectory)).toBe(true);
			const coverageJson = readCoverageJson(coverageAbsoluteDirectory);
			const expectedCoverage = readExpectedCoverage(
				"fuzz+lib+customHooks.json",
			);
			expect(libFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(targetFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(hookFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
		});
	});

	describe("for our custom Jest runner", () => {
		it("Expect no coverage reports", () => {
			executeJestRunner("**.fuzz.js", false, false, true);
			expect(defaultCoverageDirectory).toBeCreated();
			const coverageJson = readCoverageJson(defaultCoverageDirectory);
			// Jest generates an empty coverage report (unlike our non-jest fuzzer)
			expect(coverageJson).toStrictEqual({});
		});

		it("want coverage, no custom hooks", () => {
			executeJestRunner("**.fuzz.js", true, true, true);
			expect(defaultCoverageDirectory).toBeCreated();
			const coverageJson = readCoverageJson(defaultCoverageDirectory);
			const expectedCoverage = readExpectedCoverage(
				"fuzz+lib+codeCoverage-fuzz.json",
			);
			expect(libFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(targetFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(testFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(hookFile).toHaveMissingCoverageIn(coverageJson);
		});

		it("want coverage, with custom hooks", () => {
			executeJestRunner("**.fuzz.js", true, true, true);
			expect(defaultCoverageDirectory).toBeCreated();
			const coverageJson = readCoverageJson(defaultCoverageDirectory);
			const expectedCoverage = readExpectedCoverage(
				"fuzz+lib+codeCoverage-fuzz.json",
			);
			expect(libFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(targetFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(testFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(hookFile).toHaveMissingCoverageIn(coverageJson);
		});

		it("want coverage for TypeScript fuzz test", () => {
			executeJestRunner("**.fuzz.ts", true, true, true);
			expect(defaultCoverageDirectory).toBeCreated();
			const coverageJson = readCoverageJson(defaultCoverageDirectory);
			const expectedCoverage = readExpectedCoverage(
				"fuzz+lib+otherCodeCoverage-fuzz.json",
			);
			expect(libFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(targetFile).toHaveEqualCoverageIn(coverageJson, expectedCoverage);
			expect(otherTestFile).toHaveEqualCoverageIn(
				coverageJson,
				expectedCoverage,
			);
			expect(hookFile).toHaveMissingCoverageIn(coverageJson);
		});
	});
});

function readCoverageJson(coverageDirectory) {
	const coverageJson = JSON.parse(
		fs
			.readFileSync(path.join(coverageDirectory, "coverage-final.json"))
			.toString(),
	);
	expect(coverageJson).toBeTruthy();
	return coverageJson;
}

function readExpectedCoverage(name) {
	return JSON.parse(
		fs.readFileSync(path.join(expectedCoverageDirectory, name)).toString(),
	);
}

function removeCoverageDir(coverageOutputDir) {
	try {
		fs.rmSync(path.join(testDirectory, coverageOutputDir), {
			recursive: true,
			force: true,
		});
	} catch (err) {
		// ignore
	}
}

function executeJestRunner(
	testMatch,
	includeLib = true,
	includeTarget = true,
	coverage = true,
	useCustomHooks = [],
	coverageOutputDir = "coverage",
	excludePattern = [],
	verbose = false,
) {
	removeCoverageDir(coverageOutputDir);

	const includes = [];
	if (includeLib) includes.push(libFile);
	if (includeTarget) includes.push(targetFile, "fuzz.ts");
	if (!includeLib && !includeTarget) includes.push("nothing");

	const config = {
		includes: includes,
		excludes: excludePattern,
		customHooks: useCustomHooks,
	};
	// write the config file, overwriting any existing one
	fs.writeFileSync(
		path.join(testDirectory, ".jazzerjsrc.json"),
		JSON.stringify(config),
	);

	const cov = coverage ? "--coverage" : "";
	const command = ["jest", cov, `--testMatch "${testMatch}"`];
	const process = spawnSync("npx", command, {
		stdio: "pipe",
		cwd: testDirectory,
		shell: true,
	});
	if (verbose) console.log(process.output.toString());
}

function executeFuzzTest(
	dryRun,
	includeLib,
	includeTarget,
	useCustomHooks,
	coverage,
	coverageOutputDir = "coverage",
	excludePattern = "nothing",
	verbose = false,
) {
	removeCoverageDir(coverageOutputDir);
	let options = ["jazzer", "fuzz", "-e", excludePattern, "--corpus", "corpus"];
	// add dry run option
	if (dryRun) options.push("-d");
	if (includeLib) {
		options.push("-i");
		options.push(libFile);
	}
	if (includeTarget) {
		options.push("-i");
		options.push(targetFile);
	}
	if (!includeLib && !includeTarget) {
		options.push("-i");
		options.push("nothing");
	}

	if (useCustomHooks) {
		options.push("-h");
		options.push("custom-hooks");
	}
	if (coverage) {
		options.push("--cov");
	}
	if (coverageOutputDir) {
		options.push("--cov_dir");
		options.push(coverageOutputDir);
	}
	options.push("--");
	options.push("-runs=0");
	const process = spawnSync("npx", options, {
		stdio: "pipe",
		cwd: testDirectory,
		shell: true,
	});
	if (verbose) console.log(process.output.toString());
}

expect.extend({
	toHaveEqualCoverageIn(file, actualCoverage, expectedCoverage) {
		const actual = actualCoverage[path.join(testDirectory, file)];
		const expected = expectedCoverage[file];
		expect(actual).toBeDefined();
		expect(actual.statementMap).toStrictEqual(expected.statementMap);
		expect(actual.s).toStrictEqual(expected.s);
		expect(actual.fnMap).toStrictEqual(expected.fnMap);
		expect(actual.f).toStrictEqual(expected.f);
		expect(actual.branchMap).toStrictEqual(expected.branchMap);
		expect(actual.b).toStrictEqual(expected.b);
		return { pass: true };
	},
	toHaveMissingCoverageIn(file, actualCoverage) {
		expect(actualCoverage[path.join(testDirectory, file)]).toBeUndefined();
		return { pass: true };
	},
	toBeCreated(dir) {
		return { pass: fs.existsSync(dir) };
	},
});
