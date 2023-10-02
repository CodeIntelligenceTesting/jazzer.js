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
});
