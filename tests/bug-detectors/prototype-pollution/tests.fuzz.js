/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

describe("Prototype Pollution Jest tests", () => {
	it.fuzz("Pollution of Object", (data) => {
		const a = {};
		a.__proto__.a = 10;
		throw new Error("err");
	});

	it.fuzz("Assignments", (data) => {
		let a;
		a = { __proto__: { a: 10 } };
		console.error(a.__proto__);
	});

	it.fuzz("Variable declarations", (data) => {
		const a = { __proto__: { a: 10 } };
	});

	it.fuzz("Fuzzing mode pollution of Object", (data) => {
		const a = {};
		a.__proto__.a = 10;
	});
});
