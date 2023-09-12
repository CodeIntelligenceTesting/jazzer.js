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

const target = require("./target.js");
const mappedTarget = require("mappedModuleName");

jest.mock("./target.js", () => ({
	...jest.requireActual("./target.js"),
	originalFunction: () => {
		throw "the function was mocked";
	},
}));

describe("Jest Integration", () => {
	it.fuzz("execute sync test", (data) => {
		target.fuzzMe(data);
	});

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
});

describe("Run mode", () => {
	describe("skip and standard", () => {
		it.fuzz("standard test", (data) => {
			console.log("standard test called");
		});

		it.skip.fuzz("skipped test", (data) => {
			throw new Error("Skipped test not skipped!");
		});
	});
});
