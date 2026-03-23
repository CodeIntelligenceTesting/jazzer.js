/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const tests = require("./fuzz");

describe("eval", () => {
	it.fuzz("No error", (data) => {
		tests.invocationWithoutError(data);
	});

	it.fuzz("Direct invocation", (data) => {
		tests.directInvocation(data);
	});

	it.fuzz("Indirect invocation", (data) => {
		tests.indirectInvocation(data);
	});

	it.fuzz("Indirect invocation using comma operator", (data) => {
		tests.indirectInvocationUsingCommaOperator(data);
	});

	it.fuzz("Indirect invocation through optional chaining", (data) => {
		tests.indirectInvocationThroughOptionalChaining(data);
	});
});

describe("Function", () => {
	it.fuzz("No error", (data) => {
		tests.functionNoErrorNoConstructor();
	});
	it.fuzz("No error with constructor", (data) => {
		tests.functionNoErrorWithConstructor(data);
	});

	it.fuzz("With error", (data) => {
		tests.functionError(data);
	});

	it.fuzz("With error with constructor", (data) => {
		tests.functionErrorNew(data);
	});

	it.fuzz("Target string in variable name - no error", (data) => {
		tests.functionWithArgNoError(data);
	});

	it.fuzz("With error - target string in last arg", (data) => {
		tests.functionWithArgError(data);
	});

	it.fuzz("Function.prototype still exists", (data) => {
		tests.functionPrototypeExists(data);
	});
});
