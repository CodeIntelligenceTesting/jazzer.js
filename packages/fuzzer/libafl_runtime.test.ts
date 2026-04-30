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

import { addon } from "./addon";
import { fuzzer } from "./fuzzer";

const libAflOptions = {
	mode: "fuzzing" as const,
	runs: 32,
	seed: 1234,
	maxLen: 64,
	timeoutMillis: 1000,
	maxTotalTimeSeconds: 0,
	artifactPrefix: "",
	corpusDirectories: [],
	dictionaryFiles: [],
};

describe("LibAFL runtime", () => {
	it("runs synchronous fuzz targets through the native runtime", async () => {
		let invocations = 0;

		await addon.startLibAfl(
			() => {
				invocations++;
			},
			libAflOptions,
			() => undefined,
		);

		expect(invocations).toBeGreaterThan(0);
	});

	it("preserves async invocation ordering through the event loop", async () => {
		let lastInvocationCount = 0;
		let invocationCount = 1;

		await addon.startLibAflAsync(async () => {
			const value = await new Promise<number>((resolve) => {
				queueMicrotask(() => {
					setImmediate(() => resolve(invocationCount++));
				});
			});

			if (value !== lastInvocationCount + 1) {
				throw new Error(
					`Invalid invocation order: received ${value}, last ${lastInvocationCount}`,
				);
			}

			lastInvocationCount = value;
		}, libAflOptions);

		expect(lastInvocationCount).toBeGreaterThan(0);
	});

	it("records compare feedback in the shared native map", async () => {
		addon.clearCompareFeedbackMap();

		await addon.startLibAfl(
			(data: Buffer) => {
				const text = data.toString("utf8");
				fuzzer.tracer.traceStrCmp(text, "jazzer", "===", 11);
				fuzzer.tracer.traceNumberCmp(data.length, 7, "===", 12);
				fuzzer.tracer.tracePcIndir(13, data.length);
			},
			{
				mode: "fuzzing",
				runs: 1,
				seed: 9,
				maxLen: 16,
				timeoutMillis: 1000,
				maxTotalTimeSeconds: 0,
				artifactPrefix: "",
				corpusDirectories: [],
				dictionaryFiles: [],
			},
			() => undefined,
		);

		expect(addon.countNonZeroCompareFeedbackSlots()).toBeGreaterThan(0);
	});
});
