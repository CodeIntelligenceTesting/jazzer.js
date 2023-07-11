/*
 * Copyright 2022 Code Intelligence GmbH
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

const target = require("./target");

const startupTeardownCalls = [];

const addCallLog = (uniqueId) => {
	startupTeardownCalls.push(uniqueId);
};

beforeAll(() => {
	return new Promise((resolve) => {
		setTimeout(() => {
			addCallLog("Top-level beforeAll");
			resolve(undefined);
		}, 100);
	});
}, 1000);

describe("Hooks", () => {
	beforeAll((done) => {
		const callLog = "My describe: beforeAll";
		addCallLog(callLog);
		done();
	});

	afterAll((done) => {
		addCallLog("My describe: afterAll");
		done();
	});

	beforeEach(() => {
		return new Promise((resolve) => {
			setTimeout(() => {
				addCallLog("My describe: beforeEach");
				resolve(undefined);
			}, 100);
		});
	}, 500);

	afterEach(() => {
		let test = 0;
		// Busy wait, do nothing
		for (let i = 0; i < 1000; i++) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			test++;
		}
		addCallLog("My describe: afterEach");
	});

	it.fuzz("My regression test", (data) => {
		addCallLog("My fuzz test 1");
		target.fuzzMe(data);
	});

	it.fuzz("My other regression test", (data) => {
		addCallLog("My fuzz test 2");
		target.fuzzMe(data);
	});

	describe("My nested describe", () => {
		afterAll(() => {
			addCallLog("My nested describe: afterAll");
		});

		describe("My other nested describe", () => {
			it.fuzz("Nested test", (data) => {
				addCallLog("My nested fuzz test 3");
				target.fuzzMe(data);
			});
		});

		// Different definition order.
		beforeEach(() => {
			addCallLog("My nested describe: beforeEach");
		});
		afterEach(() => {
			addCallLog("My nested describe: afterEach");
		});
	});
});

// The expected call order was checked using actual Jest tests found in workerGoldenReference.test.js.
it("Confirm hook execution order", () => {
	const expectedCallChain = [
		"Top-level beforeAll",
		"My describe: beforeAll",
		"My describe: beforeEach",
		"My fuzz test 1",
		"My describe: afterEach",
		"My describe: beforeEach",
		"My fuzz test 1",
		"My describe: afterEach",
		"My describe: beforeEach",
		"My fuzz test 2",
		"My describe: afterEach",
		"My describe: beforeEach",
		"My fuzz test 2",
		"My describe: afterEach",
		"My describe: beforeEach",
		"My nested describe: beforeEach",
		"My nested fuzz test 3",
		"My nested describe: afterEach",
		"My describe: afterEach",
		"My nested describe: afterAll",
		"My describe: afterAll",
	];
	expect(startupTeardownCalls).toStrictEqual(expectedCallChain);
});
