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
const child_process = require("child_process");

const evilString =
	process.platform === "win32" ? "copy NUL EVIL" : "touch EVIL";

// Since we test on Windows and Linux, we need to use different commands to create files.
// Calling touch on Windows will result in an error and the test will fail.
// By wrapping the call to execSync in a try-catch block, we can make sure that the test will not fail.
// Bug detectors should be able to bypass the try-catch block by rethrowing the error internally.
/**
 * @param {string} data
 */
function test(data) {
	try {
		child_process.execSync(data);
	} catch (e) {
		// eslint-disable-line no-empty
	}
}

let iteration = 0;

describe("Command Injection Jest tests", () => {
	beforeEach(() => {
		iteration = 0;
	});

	it.fuzz(
		"Should fail, creating EVIL file",
		(/** @type {{ toString: () => string; }} */ data) => {
			test(data.toString());
		}
	);

	it.fuzz(
		"Should not fail, creating SAFE file",
		(/** @type {{ toString: () => string; }} */ data) => {
			test(data.toString());
		}
	);

	// Use the evil string after 10 iterations, while running in fuzzing mode.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	it.fuzz(
		"Fuzzing mode-- should fail and create EVIL file",
		(/** @type {any} */ _data) => {
			iteration++;
			if (iteration === 10) {
				test(evilString);
			}
		}
	);
});
