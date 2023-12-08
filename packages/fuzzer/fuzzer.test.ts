/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import { fuzzer } from "./fuzzer";

describe("compare hooks", () => {
	it("traceStrCmp supports equals operators", () => {
		expect(fuzzer.tracer.traceStrCmp("a", "b", "==", 0)).toBe(false);
		expect(fuzzer.tracer.traceStrCmp("a", "b", "===", 0)).toBe(false);
		expect(fuzzer.tracer.traceStrCmp("a", "b", "!=", 0)).toBe(true);
		expect(fuzzer.tracer.traceStrCmp("a", "b", "!==", 0)).toBe(true);
	});

	it("traceStrCmp handles objects of unknown types", () => {
		const foo = () => 5;
		expect(fuzzer.tracer.traceStrCmp(foo, "foo", "==", 0)).toBe(false);
		expect(fuzzer.tracer.traceStrCmp(foo, "foo", "===", 0)).toBe(false);
		expect(fuzzer.tracer.traceStrCmp(foo, "foo", "!=", 0)).toBe(true);
		expect(fuzzer.tracer.traceStrCmp(foo, "foo", "!==", 0)).toBe(true);
	});
});

describe("incrementCounter", () => {
	it("should support the NeverZero policy", () => {
		expect(fuzzer.coverageTracker.readCounter(0)).toBe(0);
		for (let counter = 1; counter <= 512; counter++) {
			fuzzer.coverageTracker.incrementCounter(0);
			if (counter < 256) {
				expect(fuzzer.coverageTracker.readCounter(0)).toBe(counter);
			} else if (counter < 511) {
				expect(fuzzer.coverageTracker.readCounter(0)).toBe((counter % 256) + 1);
			} else if (counter == 511) {
				expect(fuzzer.coverageTracker.readCounter(0)).toBe(1);
			} else {
				expect(fuzzer.coverageTracker.readCounter(0)).toBe((counter % 256) + 2);
			}
		}
	});
});
