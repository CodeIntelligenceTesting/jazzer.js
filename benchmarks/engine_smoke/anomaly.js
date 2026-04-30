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

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const benchmarkDirectory = __dirname;
const workDirectory = path.join(benchmarkDirectory, "work", "anomalies");
const engineTarget = path.join(
	benchmarkDirectory,
	"..",
	"..",
	"tests",
	"engine",
	"fuzz.js",
);
const asyncTarget = path.join(benchmarkDirectory, "anomaly_fuzz.js");

function removeIfExists(targetPath) {
	fs.rmSync(targetPath, { force: true, recursive: true });
}

function ensureDirectory(targetPath) {
	fs.mkdirSync(targetPath, { recursive: true });
}

function runCommand(label, args, cwd, outputDirectory, expectedStatus = 0) {
	console.log(`\n[anomaly] ${label}`);
	console.log(`[anomaly] command: npx ${args.join(" ")}`);
	ensureDirectory(outputDirectory);
	const sanitizedLabel = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
	const stdoutPath = path.join(outputDirectory, `${sanitizedLabel}.stdout.log`);
	const stderrPath = path.join(outputDirectory, `${sanitizedLabel}.stderr.log`);
	const stdoutFd = fs.openSync(stdoutPath, "w");
	const stderrFd = fs.openSync(stderrPath, "w");
	const startedAt = Date.now();
	const proc = spawnSync("npx", args, {
		cwd,
		env: { ...process.env },
		shell: true,
		stdio: ["ignore", stdoutFd, stderrFd],
		windowsHide: true,
	});
	const elapsedMs = Date.now() - startedAt;
	fs.closeSync(stdoutFd);
	fs.closeSync(stderrFd);

	if (proc.status !== expectedStatus) {
		throw new Error(
			`${label} failed with exit code ${proc.status}\nSTDOUT (${stdoutPath}):\n${fs.readFileSync(stdoutPath, "utf8")}\nSTDERR (${stderrPath}):\n${fs.readFileSync(stderrPath, "utf8")}`,
		);
	}

	return {
		elapsedMs,
		stderrPath,
		stdoutPath,
	};
}

function parseExecsPerSecond(stderrPath) {
	const stderr = fs.readFileSync(stderrPath, "utf8");
	const match = stderr.match(/speed:\s+([0-9.]+) exec\/s/);
	if (!match) {
		throw new Error(`No LibAFL done line found in ${stderrPath}`);
	}
	return Number.parseFloat(match[1]);
}

function runGuidedNumericSmoke() {
	const outputDirectory = path.join(workDirectory, "guided-numeric");
	const corpusDirectory = path.join(outputDirectory, "corpus");
	removeIfExists(outputDirectory);
	ensureDirectory(corpusDirectory);
	fs.writeFileSync(path.join(corpusDirectory, "seed"), Buffer.alloc(4));

	const result = runCommand(
		"guided numeric solve",
		[
			"jazzer",
			engineTarget,
			"-f",
			"guided_numeric",
			"--engine=afl",
			"--sync",
			"--disable_bug_detectors=.*",
			"--",
			corpusDirectory,
			"-runs=4000",
			"-seed=1337",
			"-max_len=16",
			`-artifact_prefix=${outputDirectory}${path.sep}`,
		],
		benchmarkDirectory,
		outputDirectory,
		77,
	);

	const output =
		fs.readFileSync(result.stdoutPath, "utf8") +
		fs.readFileSync(result.stderrPath, "utf8");
	if (!output.includes("AFL numeric guidance finding")) {
		throw new Error("Guided numeric smoke did not report the expected finding");
	}

	return {
		name: "guided-numeric",
		elapsedMs: result.elapsedMs,
	};
}

function runAsyncSmoke() {
	const outputDirectory = path.join(workDirectory, "async-smoke");
	const corpusDirectory = path.join(outputDirectory, "corpus");
	removeIfExists(outputDirectory);
	ensureDirectory(corpusDirectory);
	fs.writeFileSync(path.join(corpusDirectory, "seed"), "async-seed");

	const result = runCommand(
		"async throughput smoke",
		[
			"jazzer",
			asyncTarget,
			"-f",
			"async_smoke",
			"--engine=afl",
			"--disable_bug_detectors=.*",
			"--",
			corpusDirectory,
			"-runs=2000",
			"-seed=9001",
			"-max_len=128",
			`-artifact_prefix=${outputDirectory}${path.sep}`,
		],
		benchmarkDirectory,
		outputDirectory,
	);

	const execsPerSecond = parseExecsPerSecond(result.stderrPath);
	if (execsPerSecond <= 0) {
		throw new Error("Async smoke reported a non-positive exec/sec rate");
	}
	if (result.elapsedMs > 30000) {
		throw new Error(
			`Async smoke took unexpectedly long: ${result.elapsedMs} ms`,
		);
	}

	return {
		name: "async-smoke",
		elapsedMs: result.elapsedMs,
		execsPerSecond,
	};
}

function main() {
	ensureDirectory(workDirectory);
	const results = [runGuidedNumericSmoke(), runAsyncSmoke()];
	for (const result of results) {
		const stats = [`elapsed_ms=${result.elapsedMs}`];
		if (result.execsPerSecond !== undefined) {
			stats.push(`execs_per_second=${result.execsPerSecond}`);
		}
		console.log(`[anomaly] ${result.name}: ${stats.join(" ")}`);
	}
	fs.writeFileSync(
		path.join(workDirectory, "results.json"),
		JSON.stringify(results, null, 2),
	);
	console.log(
		`\n[anomaly] wrote machine-readable results to ${path.join(workDirectory, "results.json")}`,
	);
}

main();
