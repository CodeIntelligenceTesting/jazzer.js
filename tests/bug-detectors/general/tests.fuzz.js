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
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

const child_process = require("child_process");
const assert = require("assert");

const evilCommand = "jaz_zer";
const friendlyCommand =
	process.platform === "win32" ? "copy NUL FRIENDLY" : "touch FRIENDLY";

describe("Command Injection Jest tests", () => {
	it.fuzz("Call with EVIL command", (data) => {
		test(data.toString());
	});

	it.fuzz("Call with FRIENDLY command", (data) => {
		test(data.toString());
	});

	it.fuzz("Call with EVIL command ASYNC", async (data) => {
		test(data.toString());
	});

	it.fuzz("Call with FRIENDLY command ASYNC", (data) => {
		test(data.toString());
	});

	it.fuzz(
		"Fuzzing mode with EVIL command",
		makeFuzzFunctionWithInput(10, evilCommand),
	);

	it.fuzz(
		"Fuzzing mode with FRIENDLY command",
		makeFuzzFunctionWithInput(10, friendlyCommand),
	);

	it.fuzz("Call with EVIL command and done callback", (data, done) => {
		test(data.toString());
		done();
	});

	it.fuzz("Call with FRIENDLY command and done callback", (data, done) => {
		test(data.toString());
		done();
	});
});

// Since we test on Windows and Linux/MacOS, we need to use different commands to create files.
// Calling "touch" on Windows will result in an error and the test will fail.
// By wrapping the call to execSync in a try-catch block, we can make sure that the test will not fail.
// Bug detectors should be able to bypass the try-catch block by rethrowing the error internally.
function test(data) {
	try {
		child_process.execSync(data);
	} catch (e) {
		// eslint-disable-line no-empty
	}
}

/**
 * Generates a fuzz function that does nothing for a given number of iterations; calls the provided
 * input at the n-th iteration; and continues doing nothing thereafter.
 */
function makeFuzzFunctionWithInput(n, input) {
	assert(n > 0);
	let i = n;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return function (data) {
		i--;
		if (i === 0) {
			child_process.execSync(input);
		}
	};
}
