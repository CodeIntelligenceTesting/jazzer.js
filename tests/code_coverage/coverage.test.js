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
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawnSync } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");

// current working directory
const testDirectory = path.join(process.cwd(), "sample_fuzz_test");
const defaultCoverageDirectory = path.join(testDirectory, "coverage");
const expectedCoverageDirectory = path.join(testDirectory, "expected_coverage");
const libFile = path.join(testDirectory, "lib.js");
const targetFile = path.join(testDirectory, "fuzz.js");
const jestRunnerFile = path.join(testDirectory, "codeCoverage.fuzz.js");
const hookFile = path.join(testDirectory, "custom-hooks.js");

describe("Source code coverage reports for regular fuzz targets", () => {
	it("Expect no coverage reports", () => {
		executeFuzzTest(false, false, false, false, false);
		expect(fs.existsSync(defaultCoverageDirectory)).toBe(false);
	});
	it("Want coverage, but no includes active. Expect no coverage reports", () => {
		executeFuzzTest(false, false, false, false, true);
		expect(fs.existsSync(defaultCoverageDirectory)).toBe(false);
	});
	it("Want coverage in dry run mode, no custom hooks", () => {
		executeFuzzTest(true, true, true, false, true);
		expect(fs.existsSync(defaultCoverageDirectory)).toBe(true);
		const coverageJson = readCoverageJson(defaultCoverageDirectory);
		const expectedCoverage = readExpectedCoverage("fuzz+lib.json");
		expect(coverageJson).toBeTruthy();
		// lib.js
		expect(coverageJson[libFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[libFile], expectedCoverage["lib.js"]);
		// fuzz.js
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[targetFile], expectedCoverage["fuzz.js"]);
		// custom-hooks.js
		expect(coverageJson[hookFile]).toBeFalsy();
	});

	it("Want coverage in dry run mode, with custom hooks", () => {
		executeFuzzTest(true, true, true, true, true);
		expect(fs.existsSync(defaultCoverageDirectory)).toBe(true);
		const coverageJson = readCoverageJson(defaultCoverageDirectory);
		const expectedCoverage = readExpectedCoverage("fuzz+lib+customHooks.json");
		expect(coverageJson).toBeTruthy();
		// lib.js
		expect(coverageJson[libFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[libFile], expectedCoverage["lib.js"]);
		// fuzz.js
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[targetFile], expectedCoverage["fuzz.js"]);
		// custom-hooks.js
		// work in dry run mode
		expect(coverageJson[hookFile]).toBeTruthy();
		expectEqualCoverage(
			coverageJson[hookFile],
			expectedCoverage["custom-hooks.js"]
		);
	});

	it("Want coverage, instrumentation enabled, with custom hooks", () => {
		executeFuzzTest(false, true, true, true, true);
		expect(fs.existsSync(defaultCoverageDirectory)).toBe(true);
		const coverageJson = readCoverageJson(defaultCoverageDirectory);
		const expectedCoverage = readExpectedCoverage("fuzz+lib+customHooks.json");
		expect(coverageJson).toBeTruthy();
		// lib.js
		expect(coverageJson[libFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[libFile], expectedCoverage["lib.js"]);
		// fuzz.js
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[targetFile], expectedCoverage["fuzz.js"]);
		// custom-hooks.js
		// work in dry run mode
		expect(coverageJson[hookFile]).toBeTruthy();
		expectEqualCoverage(
			coverageJson[hookFile],
			expectedCoverage["custom-hooks.js"]
		);
	});

	it("Want coverage in a non-default directory, instrumentation enabled, with custom hooks", () => {
		const coverageDirectory = "coverage002";
		const coverageAbsoluteDirectory = path.join(
			testDirectory,
			coverageDirectory
		);
		executeFuzzTest(false, true, true, true, true, coverageDirectory);
		expect(fs.existsSync(coverageAbsoluteDirectory)).toBe(true);
		const coverageJson = readCoverageJson(coverageAbsoluteDirectory);
		const expectedCoverage = readExpectedCoverage("fuzz+lib+customHooks.json");
		expect(coverageJson).toBeTruthy();
		// lib.js
		expect(coverageJson[libFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[libFile], expectedCoverage["lib.js"]);
		// fuzz.js
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[targetFile], expectedCoverage["fuzz.js"]);
		// custom-hooks.js
		// work in dry run mode
		expect(coverageJson[hookFile]).toBeTruthy();
		expectEqualCoverage(
			coverageJson[hookFile],
			expectedCoverage["custom-hooks.js"]
		);
	});
});

describe("Source code coverage reports for our custom Jest runner", () => {
	it("Jest runner: Expect no coverage reports", () => {
		const coverageDirectory = defaultCoverageDirectory;
		executeJestRunner(false, false, false, true);
		expect(fs.existsSync(coverageDirectory)).toBe(true);
		const coverageJson = readCoverageJson(coverageDirectory);
		// Jest generates an empty coverage report (unlike our non-jest fuzzer)
		expect(coverageJson).toBeTruthy();
		expect(coverageJson).toStrictEqual({});
		expect(coverageJson[targetFile]).toBeFalsy();
		expect(coverageJson[targetFile]).toBeFalsy();
		expect(coverageJson[hookFile]).toBeFalsy();
	});

	it("Jest runner: want coverage, no custom hooks", () => {
		const coverageDirectory = defaultCoverageDirectory;
		executeJestRunner(true, true, false, true);
		expect(fs.existsSync(coverageDirectory)).toBe(true);
		const coverageJson = readCoverageJson(coverageDirectory);
		const expectedCoverage = readExpectedCoverage(
			"fuzz+lib+codeCoverage-fuzz.json"
		);
		expect(coverageJson).toBeTruthy();
		// lib.js
		expect(coverageJson[libFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[libFile], expectedCoverage["lib.js"]);
		// fuzz.js
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[targetFile], expectedCoverage["fuzz.js"]);
		// codeCoverage.fuzz.js (the main fuzz test)
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(
			coverageJson[jestRunnerFile],
			expectedCoverage["codeCoverage.fuzz.js"]
		);
		// custom-hooks.js
		expect(coverageJson[hookFile]).toBeFalsy();
	});

	it("Jest runner: want coverage, with custom hooks", () => {
		const coverageDirectory = defaultCoverageDirectory;
		executeJestRunner(true, true, false, true);
		expect(fs.existsSync(coverageDirectory)).toBe(true);
		const coverageJson = readCoverageJson(coverageDirectory);
		const expectedCoverage = readExpectedCoverage(
			"fuzz+lib+codeCoverage-fuzz.json"
		);
		expect(coverageJson).toBeTruthy();
		// lib.js
		expect(coverageJson[libFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[libFile], expectedCoverage["lib.js"]);
		// fuzz.js
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(coverageJson[targetFile], expectedCoverage["fuzz.js"]);
		// codeCoverage.fuzz.js (the main fuzz test)
		expect(coverageJson[targetFile]).toBeTruthy();
		expectEqualCoverage(
			coverageJson[jestRunnerFile],
			expectedCoverage["codeCoverage.fuzz.js"]
		);
		// custom-hooks.js
		expect(coverageJson[hookFile]).toBeFalsy();
	});
});

function readCoverageJson(coverageDirectory) {
	return JSON.parse(
		fs.readFileSync(path.join(coverageDirectory, "coverage-final.json"))
	);
}

function readExpectedCoverage(name) {
	return JSON.parse(
		fs.readFileSync(path.join(expectedCoverageDirectory, name))
	);
}

function expectEqualCoverage(coverage, expectedCoverage) {
	expect(coverage.statementMap).toStrictEqual(expectedCoverage.statementMap);
	expect(coverage.s).toStrictEqual(expectedCoverage.s);
	expect(coverage.fnMap).toStrictEqual(expectedCoverage.fnMap);
	expect(coverage.f).toStrictEqual(expectedCoverage.f);
	expect(coverage.branchMap).toStrictEqual(expectedCoverage.branchMap);
	expect(coverage.b).toStrictEqual(expectedCoverage.b);
}

function executeJestRunner(
	includeLib,
	includeTarget,
	useCustomHooks,
	coverage,
	coverageOutputDir = "coverage",
	excludePattern = ["nothing"],
	verbose = false
) {
	try {
		// remove the coverage folder if it exists
		fs.rmSync(path.join(testDirectory, coverageOutputDir), {
			recursive: true,
			force: true,
		});
	} catch (err) {
		// ignore
	}

	const includes = [];
	if (includeLib) includes.push("lib.js");
	if (includeTarget) includes.push("fuzz.js");
	if (!includeLib && !includeTarget) includes.push("nothing");

	const config = {
		includes: includes,
		excludes: excludePattern,
		fuzzerOptions: [],
		customHooks: useCustomHooks ? ["custom-hooks.js"] : [],
	};
	// write the config file, overwriting any existing one
	fs.writeFileSync(
		path.join(testDirectory, ".jazzerjsrc.json"),
		JSON.stringify(config)
	);

	let command = ["jest", "--coverage"];
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
	verbose = false
) {
	try {
		// remove the coverage folder if it exists
		fs.rmSync(path.join(testDirectory, coverageOutputDir), {
			recursive: true,
			force: true,
		});
	} catch (err) {
		// ignore
	}
	let options = ["jazzer", "fuzz", "-e", excludePattern, "--corpus", "corpus"];
	// add dry run option
	if (dryRun) options.push("-d");
	if (includeLib) {
		options.push("-i");
		options.push("lib.js");
	}
	if (includeTarget) {
		options.push("-i");
		options.push("fuzz.js");
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
		options.push("--coverage");
	}
	if (coverageOutputDir) {
		options.push("--cov_dir");
		options.push(coverageOutputDir);
	}
	options.push("--");
	options.push("-runs=0");
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const process = spawnSync("npx", options, {
		stdio: "pipe",
		cwd: testDirectory,
		shell: true,
	});
	if (verbose) console.log(process.output.toString());
}
