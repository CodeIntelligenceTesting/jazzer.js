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

/* eslint no-empty-function: 0 */
import { fuzzer } from "./fuzzer";

describe("compare hooks", () => {
	it("traceStrCmp supports equals operators", () => {
		expect(fuzzer.tracer.traceStrCmp("a", "b", "==", 0)).toBe(false);
		expect(fuzzer.tracer.traceStrCmp("a", "b", "===", 0)).toBe(false);
		expect(fuzzer.tracer.traceStrCmp("a", "b", "!=", 0)).toBe(true);
		expect(fuzzer.tracer.traceStrCmp("a", "b", "!==", 0)).toBe(true);
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
