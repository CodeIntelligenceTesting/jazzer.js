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

const startupTeardownCalls = [];

function addCallLog(uniqueId) {
	startupTeardownCalls.push(uniqueId);
}

beforeAll(() => {
	return new Promise((resolve) => {
		resolve(
			new Promise((res) => {
				setTimeout(() => {
					addCallLog("Top-level beforeAll");
					res(10);
				}, 10);
			}),
		);
	});
});

describe("My describe", () => {
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

	// First test has two regression tests
	it("My regression test 1", async () => {
		addCallLog("My fuzz test 1");
		expect(true).toBe(true);
	});

	it("My regression test 2", () => {
		addCallLog("My fuzz test 1");
		expect(true).toBe(true);
	});

	// Second test has two regression tests
	it("My regression test 3", () => {
		addCallLog("My fuzz test 2");
		expect(true).toBe(true);
	});

	it("My regression test 4", () => {
		addCallLog("My fuzz test 2");
		expect(true).toBe(true);
	});

	describe("My nested describe", () => {
		afterAll(() => {
			addCallLog("My nested describe: afterAll");
		});

		describe("My another nested describe", () => {
			// Third test test has two regression tests
			it("Nested test", () => {
				addCallLog("My nested fuzz test 3");
				expect(true).toBe(true);
			});
		});
		beforeEach(() => {
			addCallLog("My nested describe: beforeEach");
		});
		afterEach(() => {
			addCallLog("My nested describe: afterEach");
		});
	});
});

afterAll((done) => {
	//console.log("startupTeardownCalls: ", startupTeardownCalls);
	done();
}, 1000);
