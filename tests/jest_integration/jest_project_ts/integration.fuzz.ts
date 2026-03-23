/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import "@jazzer.js/jest-runner";

import * as target from "./target";

describe("Jest TS Integration", () => {
	it.fuzz("execute sync test", (data: Buffer) => {
		target.fuzzMe(data);
	});

	it.fuzz("execute async test", async (data: Buffer) => {
		await target.asyncFuzzMe(data);
	});

	it.fuzz("execute async test returning a promise", (data: Buffer) => {
		return target.asyncFuzzMe(data);
	});

	it.fuzz(
		"execute async test using a callback",
		(data: Buffer, done: (e?: Error) => void) => {
			target.callbackFuzzMe(data, done);
		},
	);

	it.fuzz(
		"execute sync hashed fuzz test with dictionary",
		(data: Buffer) => {
			target.fuzzMeHashed(data);
		},
		{
			dictionaryEntries: ["Amazing"],
		},
	);

	describe("Further options", () => {
		let i = 0;
		it.fuzz(
			"sync, number of runs, dictionary is Amazing",
			(data: Buffer) => {
				if (i === 100) {
					console.log("i = " + i);
				}
				i++;
			},
			{
				sync: true,
				fuzzerOptions: ["-runs=101"],
				dictionaryEntries: ["Amazing"],
			},
		);
	});
});
