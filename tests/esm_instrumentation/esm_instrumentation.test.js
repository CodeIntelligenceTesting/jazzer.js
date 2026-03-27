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

const { FuzzTestBuilder, cleanCrashFilesIn } = require("../helpers.js");

// module.register() is needed for ESM loader hooks.
const [major, minor] = process.versions.node.split(".").map(Number);
const supportsEsmHooks = major > 20 || (major === 20 && minor >= 6);

const describeOrSkip = supportsEsmHooks ? describe : describe.skip;

describeOrSkip("ESM instrumentation", () => {
	afterAll(async () => {
		await cleanCrashFilesIn(__dirname);
	});

	// target.mjs compares against the literal "a]3;d*F!pk29&bAc".
	// Without the ESM compare hooks replacing === with traceStrCmp,
	// libFuzzer cannot discover a 16-byte random string.
	it.each([
		["sync", true],
		["async", false],
	])(
		"should find a 16-byte string via compare hooks (%s)",
		(_label, syncMode) => {
			const fuzzTest = new FuzzTestBuilder()
				.fuzzEntryPoint("fuzz")
				.fuzzFile("fuzz.mjs")
				.dir(__dirname)
				.sync(syncMode)
				.disableBugDetectors([".*"])
				.expectedErrors("Error")
				.runs(5000000)
				.seed(111994470)
				.build();

			fuzzTest.execute();
			expect(fuzzTest.stderr).toContain("Found the ESM secret!");
		},
	);

	it("should find secret via async fuzz target", () => {
		// fuzz-async.mjs awaits before calling checkSecret, so the
		// compare hook fires in a microtask.  This exercises the TSFN
		// promise-resolution path (CallJsFuzzCallback → .then() →
		// promise->set_value) with ESM-instrumented code.
		const fuzzTest = new FuzzTestBuilder()
			.fuzzEntryPoint("fuzz")
			.fuzzFile("fuzz-async.mjs")
			.dir(__dirname)
			.disableBugDetectors([".*"])
			.expectedErrors("Error")
			.runs(5000000)
			.seed(111994470)
			.build();

		fuzzTest.execute();
		expect(fuzzTest.stderr).toContain("Found the ESM secret!");
	});
});
