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

describe("Prototype Pollution Jest tests", () => {
	console.log(Fuzzer.coverageTracker.readCounter(134));
	it.fuzz("Pollution of Object", (data) => {
		const a = {};
		//a.__proto__.polluted = 10;
	});

	it.fuzz("Assignments", (data) => {
		let a;
		a = { __proto__: { a: 10 } };
		console.log(a.__proto__);
	});

	it.fuzz("Variable declarations", (data) => {
		const a = { __proto__: { a: 10 } };
	});

	it.fuzz("Fuzzing mode pollution of Object", (data) => {
		const a = {};
		a.__proto__.a = 10;
	});
});
