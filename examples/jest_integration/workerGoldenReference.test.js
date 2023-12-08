/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
	done();
}, 1000);
