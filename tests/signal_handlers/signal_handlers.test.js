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
const {
	FuzzTestBuilder,
	// eslint-disable-next-line @typescript-eslint/no-var-requires
} = require("../helpers.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");

describe("SIGINT handlers", () => {
	let fuzzTestBuilder;

	beforeEach(() => {
		fuzzTestBuilder = new FuzzTestBuilder()
			.runs(2000)
			.dir(path.join(__dirname, "SIGINT"))
			.coverage(true)
			.verbose(true);
	});

	describe("in standalone fuzzing mode", () => {
		it("stop sync fuzzing on SIGINT", () => {
			// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.
			if (process.platform === "win32") {
				console.log(
					"// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.",
				);
				return;
			}
			const fuzzTest = fuzzTestBuilder
				.sync(true)
				.fuzzEntryPoint("SIGINT_SYNC")
				.build();
			fuzzTest.execute();
			assertSigintMessagesLogged(fuzzTest);
		});
		it("stop async fuzzing on SIGINT", () => {
			// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.
			if (process.platform === "win32") {
				console.log(
					"// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.",
				);
				return;
			}
			const fuzzTest = fuzzTestBuilder
				.sync(false)
				.fuzzEntryPoint("SIGINT_ASYNC")
				.build();
			fuzzTest.execute();
			assertSigintMessagesLogged(fuzzTest);
		});
	});

	describe("in Jest fuzzing mode", () => {
		it("stop sync fuzzing on SIGINT", () => {
			// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.
			if (process.platform === "win32") {
				console.log(
					"// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.",
				);
				return;
			}
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Sync$")
				.jestRunInFuzzingMode(true)
				.build();
			fuzzTest.execute();
			assertSigintMessagesLogged(fuzzTest);
		});
		it("stop async fuzzing on SIGINT", () => {
			// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.
			if (process.platform === "win32") {
				console.log(
					"// TODO: make the SIGINT handling produce coverage reports on Windows on exit too.",
				);
				return;
			}
			const fuzzTest = fuzzTestBuilder
				.jestTestFile("tests.fuzz.js")
				.jestTestName("^Jest Async$")
				.jestRunInFuzzingMode(true)
				.build();
			fuzzTest.execute();
			assertSigintMessagesLogged(fuzzTest);
		});
	});
});

function assertSigintMessagesLogged(fuzzTest) {
	expect(fuzzTest.stdout).toContain("kill with SIGINT");

	// We asked for a coverage report. Here we only look for the universal part of its header.
	expect(fuzzTest.stdout).toContain(
		"| % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s",
	);

	// "SIGINT handler called more than once" should not be printed in sync mode.
	expect(fuzzTest.stdout).not.toContain(
		"SIGINT has not stopped the fuzzing process",
	);
}