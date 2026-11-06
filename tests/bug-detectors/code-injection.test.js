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
const path = require("path");

const {
	FuzzTestBuilder,
	FuzzingExitCode,
	JestRegressionExitCode,
} = require("../helpers.js");

const bugDetectorDirectory = path.join(__dirname, "code-injection");

const accessFindingMessage = "Potential Code Injection (Canary Accessed)";
const invocationFindingMessage = "Confirmed Code Injection (Canary Invoked)";
const okMessage = "can be called just fine";
let fuzzTestBuilder;

beforeEach(() => {
	fuzzTestBuilder = new FuzzTestBuilder()
		.runs(0)
		.dir(bugDetectorDirectory)
		.sync(true);
});

describe("CLI", () => {
	const confirmedFindingCases = [
		"evalAccessesCanary",
		"evalIndirectAccessesCanary",
		"evalCommaOperatorAccessesCanary",
		"evalOptionalChainingAccessesCanary",
		"functionAccessesCanary",
		"functionNewAccessesCanary",
		"functionWithArgAccessesCanary",
		"functionStringCoercibleAccessesCanary",
	];

	const accessFindingCases = ["heuristicReadAccessesCanary"];

	for (const entryPoint of confirmedFindingCases) {
		it(`${entryPoint} reports confirmed code injection`, () => {
			const fuzzTest = fuzzTestBuilder.fuzzEntryPoint(entryPoint).build();
			expect(() => {
				fuzzTest.execute();
			}).toThrow(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(invocationFindingMessage);
			expect(fuzzTest.stderr).not.toContain(accessFindingMessage);
		});
	}

	for (const entryPoint of accessFindingCases) {
		it(`${entryPoint} reports potential code injection`, () => {
			const fuzzTest = fuzzTestBuilder.fuzzEntryPoint(entryPoint).build();
			expect(() => {
				fuzzTest.execute();
			}).toThrow(FuzzingExitCode);
			expect(fuzzTest.stderr).toContain(accessFindingMessage);
		});
	}

	const noFindingCases = [
		"evalSafeCode",
		"evalTargetInStringLiteral",
		"functionSafeCode",
		"functionSafeCodeNew",
		"functionTargetInArgName",
		"functionTargetInStringLiteral",
		"functionStringCoercibleSafe",
		"functionCoercesOnce",
	];

	for (const entryPoint of noFindingCases) {
		it(`${entryPoint} stays quiet`, () => {
			const fuzzTest = fuzzTestBuilder
				.fuzzEntryPoint(entryPoint)
				.build()
				.execute();
			expect(fuzzTest.stdout).toContain(okMessage);
		});
	}

	it("prints a generic access suppression example", () => {
		const fuzzTest = fuzzTestBuilder
			.fuzzEntryPoint("heuristicReadAccessesCanary")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fuzzTest.stderr).toContain(
			'getBugDetectorConfiguration("code-injection")',
		);
		expect(fuzzTest.stderr).toContain(
			"Example only: copy/paste it and adapt `stackPattern` to your needs.",
		);
		expect(fuzzTest.stderr).toContain(
			"// Example only: adapt `stackPattern` to the shown stack above.",
		);
		expect(fuzzTest.stderr).toContain("?.ignoreAccess({");
		expect(fuzzTest.stderr).toContain('stackPattern: "test.js:10"');
	});

	it("reports confirmed invocation when access reporting is disabled", () => {
		const fuzzTest = fuzzTestBuilder
			.fuzzEntryPoint("evalAccessesCanary")
			.customHooks(["disable-access.config.js"])
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fuzzTest.stderr).toContain(invocationFindingMessage);
		expect(fuzzTest.stderr).toContain("?.ignoreInvocation({");
	});

	it("falls back to potential access when invocation reporting is disabled", () => {
		const fuzzTest = fuzzTestBuilder
			.fuzzEntryPoint("evalAccessesCanary")
			.customHooks(["disable-invocation.config.js"])
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fuzzTest.stderr).toContain(accessFindingMessage);
		expect(fuzzTest.stderr).not.toContain(invocationFindingMessage);
	});

	it("suppresses heuristic access when a stack pattern matches", () => {
		const fuzzTest = fuzzTestBuilder
			.fuzzEntryPoint("heuristicReadAccessesCanary")
			.customHooks(["ignore-heuristic-access.config.js"])
			.build()
			.execute();
		expect(fuzzTest.stdout).toContain(okMessage);
		expect(fuzzTest.stderr).not.toContain(accessFindingMessage);
	});

	it("reaches invocation reporting when access is ignored by stack pattern", () => {
		const fuzzTest = fuzzTestBuilder
			.fuzzEntryPoint("evalAccessesCanary")
			.customHooks(["ignore-access-by-stack.config.js"])
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fuzzTest.stderr).toContain(invocationFindingMessage);
	});

	it("falls back to potential access when invocation is ignored", () => {
		const fuzzTest = fuzzTestBuilder
			.fuzzEntryPoint("evalAccessesCanary")
			.customHooks(["ignore-invocation-only.config.js"])
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fuzzTest.stderr).toContain(accessFindingMessage);
		expect(fuzzTest.stderr).not.toContain(invocationFindingMessage);
	});

	it("suppresses invocation when the invocation rule matches", () => {
		const fuzzTest = fuzzTestBuilder
			.fuzzEntryPoint("evalAccessesCanary")
			.customHooks(["ignore-invocation.config.js"])
			.build();
		fuzzTest.execute();
		expect(fuzzTest.stderr).not.toContain(accessFindingMessage);
		expect(fuzzTest.stderr).not.toContain(invocationFindingMessage);
	});

	it("Function.prototype should still exist", () => {
		const fuzzTest = fuzzTestBuilder
			.dryRun(false)
			.fuzzEntryPoint("functionPrototypeExists")
			.build();
		fuzzTest.execute();
	});
});

describe("Jest", () => {
	it("keeps the canary stable across sequential Jest files", () => {
		const proc = spawnSync(
			"npx",
			[
				"jest",
				"--runInBand",
				"--no-colors",
				"--runTestsByPath",
				"context-a.fuzz.js",
				"context-b.fuzz.js",
			],
			{
				cwd: bugDetectorDirectory,
				env: { ...process.env },
				shell: true,
				stdio: "pipe",
				windowsHide: true,
			},
		);

		const output = proc.stdout.toString() + proc.stderr.toString();
		expect(proc.status?.toString()).toBe(JestRegressionExitCode);
		expect(output).toContain("context-a.fuzz.js");
		expect(output).toContain("context-b.fuzz.js");
		expect(output).not.toContain("invoked canary: jaz_zer_1");
		expect(
			(output.match(/invoked canary: jaz_zer/g) ?? []).length,
		).toBeGreaterThanOrEqual(2);
	});

	it("reports confirmed invocation", () => {
		const fuzzTest = fuzzTestBuilder
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("eval Accesses canary$")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(JestRegressionExitCode);
		expect(fuzzTest.stderr).toContain(invocationFindingMessage);
		expect(fuzzTest.stderr).not.toContain(accessFindingMessage);
	});

	it("reports confirmed invocation for Function", () => {
		const fuzzTest = fuzzTestBuilder
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Function Accesses canary$")
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(JestRegressionExitCode);
		expect(fuzzTest.stderr).toContain(invocationFindingMessage);
		expect(fuzzTest.stderr).not.toContain(accessFindingMessage);
	});

	it("reports confirmed invocation when access reporting is disabled", () => {
		const fuzzTest = fuzzTestBuilder
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("eval Accesses canary$")
			.customHooks(["disable-access.config.js"])
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(JestRegressionExitCode);
		expect(fuzzTest.stderr).toContain(invocationFindingMessage);
	});

	it("falls back to potential access when invocation reporting is disabled", () => {
		const fuzzTest = fuzzTestBuilder
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("eval Accesses canary$")
			.customHooks(["disable-invocation.config.js"])
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(JestRegressionExitCode);
		expect(fuzzTest.stderr).toContain(accessFindingMessage);
		expect(fuzzTest.stderr).not.toContain(invocationFindingMessage);
	});

	it("safe code stays quiet", () => {
		const fuzzTest = fuzzTestBuilder
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("eval Safe code - no error$")
			.build()
			.execute();
		expect(fuzzTest.stdout).toContain(okMessage);
	});

	it("Function.prototype should still exist", () => {
		const fuzzTest = fuzzTestBuilder
			.dryRun(false)
			.jestTestFile("tests.fuzz.js")
			.jestTestName("Function Function.prototype still exists$")
			.build();
		fuzzTest.execute();
	});
});
