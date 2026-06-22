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

const tests = require("./fuzz");

describe("eval", () => {
	it.fuzz("Accesses canary", (data) => {
		tests.evalAccessesCanary(data);
	});

	it.fuzz("Safe code - no error", (data) => {
		tests.evalSafeCode(data);
	});

	it.fuzz("Target in string literal - no error", (data) => {
		tests.evalTargetInStringLiteral(data);
	});
});

describe("Function", () => {
	it.fuzz("Accesses canary", (data) => {
		tests.functionAccessesCanary(data);
	});

	it.fuzz("Safe code - no error", (data) => {
		tests.functionSafeCode(data);
	});

	it.fuzz("Function.prototype still exists", (data) => {
		tests.functionPrototypeExists(data);
	});
});
