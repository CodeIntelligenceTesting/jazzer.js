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

describeOrSkip("Mixed CJS + ESM instrumentation", () => {
	afterAll(async () => {
		await cleanCrashFilesIn(__dirname);
	});

	it("should find a secret split across a CJS and an ESM module", () => {
		// The fuzz target imports checkCjs from cjs-check.cjs
		// (instrumented via hookRequire) and checkEsm from
		// esm-check.mjs (instrumented via the ESM loader hook).
		// Both are 10-byte random string literals that can only
		// be discovered through their respective compare hooks.
		const fuzzTest = new FuzzTestBuilder()
			.fuzzEntryPoint("fuzz")
			.fuzzFile("fuzz.mjs")
			.dir(__dirname)
			.sync(true)
			.disableBugDetectors([".*"])
			.expectedErrors("Error")
			.runs(5000000)
			.seed(111994470)
			.build();

		fuzzTest.execute();
		expect(fuzzTest.stderr).toContain("Found the mixed CJS+ESM secret!");
	});
});
