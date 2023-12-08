/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
