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

const libCoverage = require("istanbul-lib-coverage");

const benchmarkDirectory = __dirname;
const workDirectory = path.join(benchmarkDirectory, "work");
const fuzzTarget = path.join(benchmarkDirectory, "fuzz.js");
const seedCorpusDirectory = path.join(benchmarkDirectory, "seeds");
const seconds = Number.parseInt(process.argv[2] ?? "30", 10);

function removeIfExists(targetPath) {
	fs.rmSync(targetPath, { force: true, recursive: true });
}

function ensureDirectory(targetPath) {
	fs.mkdirSync(targetPath, { recursive: true });
}

function runCommand(label, args, engineDirectory) {
	console.log(`\n[smoke] ${label}`);
	console.log(`[smoke] command: npx ${args.join(" ")}`);
	ensureDirectory(engineDirectory);
	const sanitizedLabel = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
	const stdoutPath = path.join(engineDirectory, `${sanitizedLabel}.stdout.log`);
	const stderrPath = path.join(engineDirectory, `${sanitizedLabel}.stderr.log`);
	const stdoutFd = fs.openSync(stdoutPath, "w");
	const stderrFd = fs.openSync(stderrPath, "w");
	const proc = spawnSync("npx", args, {
		cwd: benchmarkDirectory,
		env: { ...process.env },
		shell: true,
		stdio: ["ignore", stdoutFd, stderrFd],
		windowsHide: true,
	});
	fs.closeSync(stdoutFd);
	fs.closeSync(stderrFd);
	if (proc.status !== 0) {
		throw new Error(
			`${label} failed with exit code ${proc.status}\nSTDOUT (${stdoutPath}):\n${fs.readFileSync(stdoutPath, "utf8")}\nSTDERR (${stderrPath}):\n${fs.readFileSync(stderrPath, "utf8")}`,
		);
	}
	return { stdoutPath, stderrPath };
}

function countFiles(directory) {
	if (!fs.existsSync(directory)) {
		return 0;
	}
	return fs
		.readdirSync(directory)
		.filter((entry) => fs.lstatSync(path.join(directory, entry)).isFile())
		.length;
}

function summarizeCoverage(coverageDirectory) {
	const coverageFile = path.join(coverageDirectory, "coverage-final.json");
	const rawCoverage = JSON.parse(fs.readFileSync(coverageFile, "utf8"));
	const coverageMap = libCoverage.createCoverageMap(rawCoverage);
	const librarySummary = libCoverage.createCoverageSummary();
	const normalizedNeedle = `${path.sep}node_modules${path.sep}qs${path.sep}`;

	const files = coverageMap
		.files()
		.filter((filePath) => path.normalize(filePath).includes(normalizedNeedle));
	for (const filePath of files) {
		librarySummary.merge(coverageMap.fileCoverageFor(filePath).toSummary());
	}

	return {
		files: files.length,
		lines: librarySummary.data.lines.pct,
		branches: librarySummary.data.branches.pct,
		functions: librarySummary.data.functions.pct,
		statements: librarySummary.data.statements.pct,
	};
}

function runSmoke(engine) {
	const engineDirectory = path.join(workDirectory, engine);
	const generatedCorpusDirectory = path.join(
		engineDirectory,
		"generated-corpus",
	);
	const artifactDirectory = path.join(engineDirectory, "artifacts");
	const coverageDirectory = path.join(engineDirectory, "coverage");

	removeIfExists(engineDirectory);
	ensureDirectory(generatedCorpusDirectory);
	ensureDirectory(artifactDirectory);

	runCommand(
		`${engine} fuzzing`,
		[
			"jazzer",
			fuzzTarget,
			generatedCorpusDirectory,
			seedCorpusDirectory,
			"--sync",
			"--disable_bug_detectors=.*",
			`--engine=${engine}`,
			"-i=fuzz.js",
			"-i=node_modules/qs/",
			"--",
			`-max_total_time=${seconds}`,
			`-artifact_prefix=${artifactDirectory}${path.sep}`,
		],
		engineDirectory,
	);

	removeIfExists(coverageDirectory);
	runCommand(
		`${engine} regression coverage`,
		[
			"jazzer",
			fuzzTarget,
			generatedCorpusDirectory,
			seedCorpusDirectory,
			"--sync",
			"--mode=regression",
			"--coverage",
			`--coverage_directory=${coverageDirectory}`,
			"--coverage_reporters=json",
			"--disable_bug_detectors=.*",
			`--engine=${engine}`,
			"-i=fuzz.js",
			"-i=node_modules/qs/",
		],
		engineDirectory,
	);

	return {
		engine,
		seconds,
		generatedCorpusEntries: countFiles(generatedCorpusDirectory),
		coverage: summarizeCoverage(coverageDirectory),
	};
}

function printResult(result) {
	console.log(`\n[smoke] ${result.engine}`);
	console.log(
		`[smoke] generated corpus entries: ${result.generatedCorpusEntries}`,
	);
	console.log(
		`[smoke] library coverage: lines=${result.coverage.lines}% branches=${result.coverage.branches}% functions=${result.coverage.functions}% statements=${result.coverage.statements}% across ${result.coverage.files} files`,
	);
}

function main() {
	ensureDirectory(workDirectory);
	const results = [runSmoke("libfuzzer"), runSmoke("afl")];
	for (const result of results) {
		printResult(result);
	}
	fs.writeFileSync(
		path.join(workDirectory, "results.json"),
		JSON.stringify(results, null, 2),
	);
	console.log(
		`\n[smoke] wrote machine-readable results to ${path.join(workDirectory, "results.json")}`,
	);
}

main();
