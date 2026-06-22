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

import { spawnSync } from "child_process";
import * as path from "path";

import { addon } from "./addon";
import { fuzzer } from "./fuzzer";

function nativeAddonPath(): string {
	return path.join(
		__dirname,
		"prebuilds",
		`fuzzer-${process.platform}-${process.arch}.node`,
	);
}

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

	it("rejects invalid counter ranges at the native boundary", () => {
		const coverageMap = Buffer.alloc(16);
		addon.registerCoverageMap(coverageMap);
		for (const [oldNumCounters, newNumCounters] of [
			[-1, 1],
			[1.5, 2],
			[Number.NaN, 1],
			[Number.POSITIVE_INFINITY, 1],
			[1, 2.5],
		] as const) {
			expect(() =>
				addon.registerNewCounters(oldNumCounters, newNumCounters),
			).toThrow();
		}
	});

	it("exits cleanly after a synchronous libFuzzer run", () => {
		const script = `
			const addon = require(${JSON.stringify(nativeAddonPath())});
			const coverageMap = Buffer.alloc(${1 << 20});
			const timeout = setTimeout(() => {
				console.error("process did not exit naturally");
				process.exit(4);
			}, 1000);
			timeout.unref();

			addon.registerCoverageMap(coverageMap);
			addon.registerNewCounters(0, 512);

			addon
				.startFuzzing(
					() => undefined,
					[
						"jazzer-libfuzzer-exit-test",
						"-runs=1",
						"-seed=1234",
						"-max_len=32",
					],
					() => undefined,
				)
				.then(() => {
					clearTimeout(timeout);
				})
				.catch((error) => {
					console.error(error);
					process.exit(3);
				});
		`;

		const result = spawnSync(process.execPath, ["-e", script], {
			encoding: "utf8",
			timeout: 5000,
		});

		expect(result.signal).toBeNull();
		expect(result.status).toBe(0);
	});
});
