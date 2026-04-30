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

const { addon } = require("../dist/addon.js");
const { fuzzer } = require("../dist/fuzzer.js");

const runs = Number(process.env.JAZZER_LIBAFL_RUNS ?? "20000");
const seed = Number(process.env.JAZZER_LIBAFL_SEED ?? "1337");
const maxLen = Number(process.env.JAZZER_LIBAFL_MAX_LEN ?? "64");

const libFuzzerArgs = [
	"jazzer-libfuzzer-benchmark",
	`-runs=${runs}`,
	`-seed=${seed}`,
	`-max_len=${maxLen}`,
];
const libAflOptions = {
	mode: "fuzzing",
	runs,
	seed,
	maxLen,
	timeoutMillis: 1000,
	maxTotalTimeSeconds: 0,
	artifactPrefix: "",
	corpusDirectories: [],
	dictionaryFiles: [],
};

async function measure(name, start) {
	console.log(`\nRunning ${name}...`);
	let invocations = 0;
	const startedAt = process.hrtime.bigint();
	await start(() => {
		invocations++;
	});
	const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
	return {
		name,
		invocations,
		elapsedSeconds,
		execsPerSecond: invocations / elapsedSeconds,
	};
}

async function measureCompareHeavy(name, start) {
	console.log(`\nRunning ${name}...`);
	let invocations = 0;
	const startedAt = process.hrtime.bigint();
	await start((data) => {
		invocations++;
		const text = data.toString("utf8");
		for (let i = 0; i < 32; i++) {
			fuzzer.tracer.traceStrCmp(text, `cmp-${i}`, "===", i + 1);
			fuzzer.tracer.traceNumberCmp(data.length, i, "===", i + 128);
			fuzzer.tracer.tracePcIndir(i + 512, data.length ^ i);
		}
	});
	const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
	return {
		name,
		invocations,
		elapsedSeconds,
		execsPerSecond: invocations / elapsedSeconds,
	};
}

function printResult(result) {
	console.log(
		`${result.name.padEnd(28)} ${result.invocations
			.toString()
			.padStart(
				8,
			)} execs  ${result.elapsedSeconds.toFixed(3).padStart(8)} s  ${result.execsPerSecond
			.toFixed(0)
			.padStart(10)} exec/s`,
	);
}

async function main() {
	console.log(
		`Benchmarking with runs=${runs}, seed=${seed}, max_len=${maxLen}`,
	);

	const results = [];
	results.push(
		await measure("libFuzzer sync trivial", (target) =>
			addon.startFuzzing(target, libFuzzerArgs, () => undefined),
		),
	);
	results.push(
		await measure("LibAFL sync trivial", (target) =>
			addon.startLibAfl(target, libAflOptions, () => undefined),
		),
	);
	results.push(
		await measure("libFuzzer async trivial", (target) =>
			addon.startFuzzingAsync(
				() =>
					new Promise((resolve) => {
						target();
						setImmediate(resolve);
					}),
				libFuzzerArgs,
			),
		),
	);
	results.push(
		await measure("LibAFL async trivial", (target) =>
			addon.startLibAflAsync(
				() =>
					new Promise((resolve) => {
						target();
						setImmediate(resolve);
					}),
				libAflOptions,
			),
		),
	);
	results.push(
		await measureCompareHeavy("libFuzzer compare-heavy", (target) =>
			addon.startFuzzing(target, libFuzzerArgs, () => undefined),
		),
	);
	results.push(
		await measureCompareHeavy("LibAFL compare-heavy", (target) =>
			addon.startLibAfl(target, libAflOptions, () => undefined),
		),
	);

	console.log("");
	for (const result of results) {
		printResult(result);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
