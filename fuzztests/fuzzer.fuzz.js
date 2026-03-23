/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const { FuzzedDataProvider } = require("@jazzer.js/core");
const { fuzzer } = require("@jazzer.js/fuzzer");

describe("fuzzer", () => {
	it.fuzz("traceStrCmp", (data) => {
		const provider = new FuzzedDataProvider(data);
		let a = provider.consumeString(10);
		let b = provider.consumeString(10);
		let op = provider.consumeString(5);
		expect(fuzzer.tracer.traceStrCmp(a, b, op, 0)).toBeDefined();
	});

	it.skip.fuzz("use never zero policy", (data) => {
		const provider = new FuzzedDataProvider(data);
		const iterations = provider.consumeIntegralInRange(1, 1 << 8);
		for (let i = 0; i < iterations; i++) {
			fuzzer.coverageTracker.incrementCounter(0);
		}
		expect(fuzzer.coverageTracker.readCounter(0)).not.toEqual(0);
	});
});
