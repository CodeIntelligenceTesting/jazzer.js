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
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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

function nativeAddonPath(): string {
	return path.join(
		__dirname,
		"prebuilds",
		`fuzzer-${process.platform}-${process.arch}.node`,
	);
}

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

	it("rejects overlapping LibAFL runs", async () => {
		let releaseFirstInput!: () => void;
		let blockedFirstInput = false;
		const firstInput = new Promise<void>((resolve) => {
			releaseFirstInput = resolve;
		});

		const firstRun = addon.startLibAflAsync(
			() => {
				if (blockedFirstInput) {
					return undefined;
				}
				blockedFirstInput = true;
				return firstInput;
			},
			{ ...libAflOptions, runs: 1 },
		);

		try {
			expect(() =>
				addon.startLibAflAsync(() => undefined, { ...libAflOptions, runs: 1 }),
			).toThrow("only supports one active run per process");
		} finally {
			releaseFirstInput();
			await firstRun;
		}
	});

	it("settles async findings after releasing the native runtime", async () => {
		const artifactDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "jazzer-libafl-lifetime-"),
		);

		try {
			await expect(
				addon.startLibAflAsync(
					() => {
						throw new Error("first finding");
					},
					{
						...libAflOptions,
						artifactPrefix: `${artifactDirectory}${path.sep}`,
					},
				),
			).rejects.toThrow("first finding");

			await addon.startLibAflAsync(() => undefined, {
				...libAflOptions,
				runs: 1,
			});
		} finally {
			fs.rmSync(artifactDirectory, { force: true, recursive: true });
		}
	});

	it("publishes async finding metadata before the runtime reports it", () => {
		const artifactDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "jazzer-libafl-objective-"),
		);

		try {
			const script = `
				const addon = require(${JSON.stringify(nativeAddonPath())});
				addon.registerCoverageMap(Buffer.alloc(${1 << 20}));
				addon.registerNewCounters(0, 512);

				addon.startLibAflAsync(
					async () => {
						throw new Error("async objective finding");
					},
					${JSON.stringify({
						...libAflOptions,
						runs: 1,
						artifactPrefix: `${artifactDirectory}${path.sep}`,
					})},
				)
					.then(() => process.exit(2))
					.catch((error) => {
						if (!String(error).includes("async objective finding")) {
							console.error(error);
							process.exit(3);
						}
						setTimeout(() => process.exit(0), 0);
					});
			`;

			const result = spawnSync(process.execPath, ["-e", script], {
				encoding: "utf8",
			});

			if (result.signal !== null || result.status !== 0) {
				throw new Error(
					`Child process exited with status ${result.status} and signal ${result.signal}: ${result.stderr}`,
				);
			}

			expect(result.stderr).toMatch(
				/\[!\] #\d+\s+\| artifact: crash-[0-9a-f]+ \| Error: async objective finding/,
			);
		} finally {
			fs.rmSync(artifactDirectory, { force: true, recursive: true });
		}
	});

	it("ignores late done callbacks after an input already settled", () => {
		const script = `
			const addon = require(${JSON.stringify(nativeAddonPath())});
			addon.registerCoverageMap(Buffer.alloc(${1 << 20}));
			addon.registerNewCounters(0, 512);

			let invocations = 0;
			addon.startLibAflAsync(
				(_data, done) => {
					invocations += 1;
					done();
					if (invocations === 1) {
						setImmediate(() => done(new Error("late stale error")));
					}
				},
				${JSON.stringify({ ...libAflOptions, runs: 2 })},
			)
				.then(() => setTimeout(() => process.exit(0), 50))
				.catch((error) => {
					console.error(error);
					process.exit(1);
				});
		`;

		const result = spawnSync(process.execPath, ["-e", script], {
			encoding: "utf8",
		});

		if (result.signal !== null || result.status !== 0) {
			throw new Error(
				`Child process exited with status ${result.status} and signal ${result.signal}: ${result.stderr}`,
			);
		}
	});

	// On Windows, process.kill(..., "SIGINT") terminates the target process
	// instead of delivering a recoverable signal event to userland listeners.
	(process.platform === "win32" ? it.skip : it)(
		"restores previous SIGINT handlers after fuzzing",
		() => {
			const options = { ...libAflOptions, runs: 1 };
			const script = `
			const addon = require(${JSON.stringify(nativeAddonPath())});
			addon.registerCoverageMap(Buffer.alloc(${1 << 20}));
			addon.registerNewCounters(0, 512);

			let restored = false;
			process.on("SIGINT", () => {
				restored = true;
			});

			addon.startLibAfl(() => undefined, ${JSON.stringify(options)}, () => undefined)
				.then(() => {
					process.kill(process.pid, "SIGINT");
					setTimeout(() => process.exit(restored ? 0 : 2), 50);
				})
				.catch((error) => {
					console.error(error);
					process.exit(1);
				});
		`;

			const result = spawnSync(process.execPath, ["-e", script], {
				encoding: "utf8",
			});

			if (result.signal !== null || result.status !== 0) {
				throw new Error(
					`Child process exited with status ${result.status} and signal ${result.signal}: ${result.stderr}`,
				);
			}
		},
	);

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
		expect(addon.countCompareLogEntries()).toBeGreaterThan(0);
		expect(addon.countDroppedCompareLogEntries()).toBe(0);
	});
});
