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

const mappedTarget = require("mappedModuleName");

const { reportFinding } = require("@jazzer.js/core");

const target = require("./target.js");

jest.mock("./target.js", () => ({
	...jest.requireActual("./target.js"),
	originalFunction: () => {
		throw "the function was mocked";
	},
}));

// These should not be seen in the stack trace, because the test
// explicitly looks for these strings.
const findingMessage = "Finding reported!";
const errorMessage = "This error should not be reported!";

describe("Jest Integration", () => {
	it.fuzz("execute sync test", (data) => {
		target.fuzzMe(data);
	});

	it.fuzz(
		"execute sync hashed fuzz test with dictionary",
		(data) => {
			target.fuzzMeHashed(data);
		},
		{ dictionaryEntries: ["Amazing"] },
	);

	it.fuzz(
		"execute sync hashed fuzz test with uint8 dictionary",
		(data) => {
			target.fuzzMeHashed(data);
		},
		{
			dictionaryEntries: [
				new Uint8Array([0x41, 0x6d, 0x61, 0x7a, 0x69, 0x6e, 0x67]),
				// Adding an entry with all bytes to the dictionary should not affect the fuzzing.
				// This tests if escaping all 256 characters works in a way that libFuzzer is happy with it.
				new Uint8Array([...Array(256).keys()]),
			],
		},
	);

	it.fuzz("execute async test", async (data) => {
		await target.asyncFuzzMe(data);
	});

	it.fuzz("execute async test returning a promise", (data) => {
		return target.asyncFuzzMe(data);
	});

	it.fuzz("execute async test using a callback", (data, done) => {
		target.callbackFuzzMe(data, done);
	});

	it.fuzz("execute async timeout test plain", async (data) => {
		await target.asyncTimeout(data);
	});

	it.fuzz("execute sync timeout test plain", (data) => {
		target.syncTimeout(data);
	});

	it.fuzz(
		"execute async timeout test with method timeout",
		async (data) => {
			await target.asyncTimeout(data);
		},
		10,
	);

	it.fuzz(
		"execute async timeout test using a callback",
		(data, done) => {
			target.callbackTimeout(data, done);
		},
		10,
	);

	// noinspection JSUnusedLocalSymbols
	it.fuzz("honor test name pattern", (data) => {
		// Do nothing, as this test is only used to check thi test name pattern.
	});

	// noinspection JSUnusedLocalSymbols
	it.fuzz("honor test name pattern as well", (data) => {
		throw new Error("This test should not be executed!");
	});

	it.fuzz("mock test function", (data) => {
		target.originalFunction(data);
	});

	it.fuzz("load by mapped module name", (data) => {
		mappedTarget.fuzzMe(data);
	});

	it.fuzz("prioritize finding over error", (data) => {
		reportFinding(findingMessage);
		throw new Error(errorMessage);
	});
});

describe("Run mode", () => {
	describe("skip and standard", () => {
		it.skip.fuzz("skipped test", (data) => {
			throw new Error("Skipped test not skipped!");
		});

		it.fuzz("standard test", (data) => {
			console.log("standard test called");
		});
	});
});
