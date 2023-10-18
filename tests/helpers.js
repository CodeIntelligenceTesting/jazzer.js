/*
 * Copyright 2023 Code Intelligence GmbH
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

const assert = require("assert");
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FuzzingExitCode = "77";
const TimeoutExitCode = "70";
const JestRegressionExitCode = "1";

class FuzzTest {
	constructor(
		logTestOutput,
		includes,
		excludes,
		customHooks,
		dictionaries,
		dir,
		disableBugDetectors,
		dryRun,
		forkMode,
		fuzzEntryPoint,
		fuzzFile,
		jestRunInFuzzingMode,
		jestTestFile,
		jestTestName,
		runs,
		seed,
		sync,
		verbose,
		listFuzzTestNames,
		listFuzzTestNamesPattern,
		coverage,
		expectedErrors,
		asJson,
		timeout,
	) {
		this.logTestOutput = logTestOutput;
		this.includes = includes;
		this.excludes = excludes;
		this.customHooks = customHooks;
		this.dictionaries = dictionaries;
		this.dir = dir;
		this.disableBugDetectors = disableBugDetectors;
		this.dryRun = dryRun;
		this.forkMode = forkMode;
		this.fuzzEntryPoint = fuzzEntryPoint;
		this.fuzzFile = fuzzFile;
		this.jestRunInFuzzingMode = jestRunInFuzzingMode;
		this.jestTestFile = jestTestFile;
		this.jestTestNamePattern = jestTestName;
		this.runs = runs;
		this.seed = seed;
		this.sync = sync;
		this.verbose = verbose;
		this.listFuzzTestNames = listFuzzTestNames;
		this.listFuzzTestNamesPattern = listFuzzTestNamesPattern;
		this.coverage = coverage;
		this.expectedErrors = expectedErrors;
		this.asJson = asJson;
		this.timeout = timeout;
	}

	// Runs the fuzz test in another process using `spawnSync`.
	execute() {
		if (this.jestTestFile) {
			this.#executeWithJest();
		} else {
			this.#executeWithCli();
		}
		return this;
	}

	// Runs the fuzz test using `spawn`. This is useful when we want to do something while the fuzz test
	// is running (e.g. process http requests).
	executeWithPromise() {
		if (this.jestTestFile) {
			return this.#executeWithJest(false);
		} else {
			return this.#executeWithCli(false);
		}
	}

	#executeWithCli(useSpawnSync = true) {
		const options = ["jazzer", this.fuzzFile];
		options.push("-f " + this.fuzzEntryPoint);
		if (this.sync) options.push("--sync");
		if (this.coverage) options.push("--coverage");
		if (this.verbose) options.push("--verbose");
		if (this.dryRun !== undefined) options.push("--dry_run=" + this.dryRun);
		if (this.timeout !== undefined) options.push("--timeout=" + this.timeout);
		for (const include of this.includes) {
			options.push("-i=" + include);
		}
		for (const exclude of this.excludes) {
			options.push("-e=" + exclude);
		}
		for (const bugDetector of this.disableBugDetectors) {
			options.push("--disable_bug_detectors=" + bugDetector);
		}
		for (const customHook of this.customHooks) {
			options.push("--custom_hooks=" + customHook);
		}
		for (const expectedError of this.expectedErrors) {
			options.push("-x=" + expectedError);
		}
		options.push("--");
		if (this.runs !== undefined) options.push("-runs=" + this.runs);
		if (this.forkMode) options.push("-fork=" + this.forkMode);
		if (this.seed) options.push("-seed=" + this.seed);
		for (const dictionary of this.dictionaries) {
			options.push("-dict=" + dictionary);
		}
		if (useSpawnSync) {
			this.#spawnTestSync("npx", options, { ...process.env });
		} else {
			return this.#spawnTest("npx", options, { ...process.env });
		}
	}

	#executeWithJest(useSpawnSync = true) {
		const fuzzerOptions = [];
		if (this.runs) {
			fuzzerOptions.push("-runs=" + this.runs);
		}
		if (this.seed) {
			fuzzerOptions.push("-seed=" + this.seed);
		}
		const dictionaries = this.dictionaries.map(
			(dictionary) => "-dict=" + dictionary,
		);
		fuzzerOptions.push(...dictionaries);

		const config = {};
		if (this.sync !== undefined) {
			config.sync = this.sync;
		}
		if (this.dryRun !== undefined) {
			config.dryRun = this.dryRun;
		}
		if (this.includes.length > 0) {
			config.includes = this.includes;
		}
		if (this.excludes.length > 0) {
			config.excludes = this.excludes;
		}
		if (this.disableBugDetectors.length > 0) {
			config.disableBugDetectors = this.disableBugDetectors;
		}
		if (fuzzerOptions.length > 0) {
			config.fuzzerOptions = fuzzerOptions;
		}
		if (this.customHooks.length > 0) {
			config.customHooks = this.customHooks;
		}
		if (this.jestRunInFuzzingMode !== undefined) {
			config.mode = this.jestRunInFuzzingMode ? "fuzzing" : "regression";
		}
		if (this.timeout !== undefined) {
			config.timeout = this.timeout;
		}
		if (this.verbose) {
			config.verbose = this.verbose;
		}

		// Write jest config file even if it exists
		fs.writeFileSync(
			path.join(this.dir, ".jazzerjsrc.json"),
			JSON.stringify(config),
		);
		const cmd = "npx";
		const options = [
			"jest",
			this.jestTestFile,
			'--testNamePattern="' + this.jestTestNamePattern + '"',
			"--no-colors",
			this.asJson ? "--json" : "",
			this.coverage ? "--coverage" : "",
			this.listFuzzTestNames ? "--reporters=" : "",
		];
		let env = { ...process.env };
		if (this.listFuzzTestNames) {
			env.JAZZER_LIST_FUZZTEST_NAMES = "1";
		}
		if (this.listFuzzTestNamesPattern) {
			env.JAZZER_LIST_FUZZTEST_NAMES_PATTERN = this.listFuzzTestNamesPattern;
		}

		if (useSpawnSync) {
			this.#spawnTestSync(cmd, options, env);
		} else {
			return this.#spawnTest(cmd, options, env);
		}
	}

	#spawnTestSync(cmd, options, env) {
		if (this.logTestOutput) {
			console.log("COMMAND: " + cmd + " " + options.join(" "));
		}
		const proc = spawnSync(cmd, options, {
			stdio: "pipe",
			cwd: this.dir,
			shell: true,
			windowsHide: true,
			env: env,
		});
		this.stdout = proc.stdout.toString();
		this.stderr = proc.stderr.toString();
		this.status = proc.status;
		if (this.logTestOutput) {
			console.log("STDOUT: " + this.stdout.toString());
			console.log("STDERR: " + this.stderr.toString());
			console.log("STATUS: " + this.status);
		}
		if (this.status !== 0 && this.status !== null) {
			throw new Error(this.status.toString());
		}
	}

	#spawnTest(cmd, options, env) {
		return new Promise((resolve, reject) => {
			if (this.logTestOutput) {
				console.log("COMMAND: " + cmd + " " + options.join(" "));
			}
			const proc = spawn(cmd, options, {
				stdio: "pipe",
				cwd: this.dir,
				shell: true,
				windowsHide: true,
				env: env,
			});
			this.stdout = "";
			this.stderr = "";
			proc.stdout.on("data", (data) => {
				this.stdout += data;
			});

			proc.stderr.on("data", (data) => {
				this.stderr += data;
			});

			// wait for process to finish
			proc.on("exit", () => {
				this.status = proc.exitCode.toString();
				if (this.logTestOutput) {
					console.log("STDOUT: " + this.stdout);
					console.log("STDERR: " + this.stderr);
					console.log("STATUS: " + this.status);
				}
				if (this.status !== "0") {
					reject(new Error(this.status.toString()));
				} else {
					resolve(this.status.toString());
				}
			});
		});
	}
}

// noinspection JSUnusedGlobalSymbols
class FuzzTestBuilder {
	_logTestOutput = false;
	_sync = undefined;
	_dryRun = undefined;
	_runs = undefined;
	_verbose = false;
	_listFuzzTestNames = false;
	_listFuzzTestNamesPattern = undefined;
	_fuzzEntryPoint = "";
	_dir = "";
	_fuzzFile = "fuzz";
	_includes = [];
	_excludes = [];
	_disableBugDetectors = [];
	_customHooks = [];
	_forkMode = 0;
	_seed = 100;
	_jestTestFile = "";
	_jestTestName = "";
	_jestRunInFuzzingMode = undefined;
	_dictionaries = [];
	_coverage = false;
	_expectedErrors = [];
	_asJson = false;
	_timeout = undefined;

	/**
	 * @param {boolean} logTestOutput - whether to print the output of the fuzz test to the console.
	 * True if parameter is undefined.
	 */
	logTestOutput(logTestOutput = true) {
		this._logTestOutput = logTestOutput;
		return this;
	}

	/**
	 * @param {boolean} sync - whether to run the fuzz test in synchronous mode.
	 */
	sync(sync) {
		this._sync = sync;
		return this;
	}

	/**
	 * @param {number} runs - libFuzzer's (-runs=<runs>) option. Number of times the fuzz target
	 * function should be executed.
	 */
	runs(runs) {
		this._runs = runs;
		return this;
	}

	/**
	 * @param {boolean} verbose - set verbose/debug output in fuzz test.
	 */
	verbose(verbose = true) {
		this._verbose = verbose;
		return this;
	}

	/**
	 * @param {boolean} listFuzzTestNames - whether to list all fuzz test names on the console.
	 * True if parameter is undefined.
	 */
	listFuzzTestNames(listFuzzTestNames = true) {
		this._listFuzzTestNames = listFuzzTestNames;
		if (this._listFuzzTestNames) {
			this.jestTestName("__NOT_AN_ACTUAL_TESTNAME__");
		}
		return this;
	}

	/**
	 * @param {boolean} listFuzzTestNamesPattern - pattern to filter the list of all fuzz test names.
	 */
	listFuzzTestNamesPattern(listFuzzTestNamesPattern) {
		this._listFuzzTestNamesPattern = listFuzzTestNamesPattern;
		return this;
	}

	/**
	 * @param {boolean} dryRun
	 */
	dryRun(dryRun) {
		this._dryRun = dryRun;
		return this;
	}

	/**
	 * @param {string} fuzzEntryPoint
	 */
	fuzzEntryPoint(fuzzEntryPoint) {
		this._fuzzEntryPoint = fuzzEntryPoint;
		return this;
	}

	/**
	 * @param {string} dir - directory in which the fuzz test should be executed. It should contain the file
	 * with the fuzz entry point / Jest test file.
	 */
	dir(dir) {
		this._dir = dir;
		return this;
	}

	fuzzFile(fuzzFile) {
		this._fuzzFile = fuzzFile;
		return this;
	}

	/**
	 * @param {string[]} includes - instrumentation include pattern
	 */
	includes(includes) {
		if (!Array.isArray(includes)) {
			includes = [includes];
		}
		this._includes = includes;
		return this;
	}

	/**
	 * @param {string[]} excludes - instrumentation excludes pattern
	 */
	excludes(excludes) {
		if (!Array.isArray(excludes)) {
			excludes = [excludes];
		}
		this._excludes = excludes;
		return this;
	}

	/**
	 * @param {string[]} bugDetectors - bug detectors to disable. This will set Jazzer.js's command line flag
	 * --disableBugDetectors=bugDetector1 --disableBugDetectors=bugDetector2 ...
	 */
	disableBugDetectors(bugDetectors) {
		if (!Array.isArray(bugDetectors)) {
			bugDetectors = [bugDetectors];
		}
		this._disableBugDetectors = bugDetectors;
		return this;
	}

	/**
	 * @param {string[]} file - an array of strings that represent the custom hooks files.
	 * @returns {FuzzTestBuilder}
	 */
	customHooks(file) {
		// make sure it's an array of strings
		if (!Array.isArray(file)) {
			// throw error
			throw new Error("customHooks must be an array of strings");
		}
		this._customHooks = file;
		return this;
	}

	/**
	 * @param {number} forkMode - sets libFuzzer's fork mode (-fork=<fork>). Default is 0 (disabled).
	 * When enabled and greater zero, the number
	 * tells how many processes to fork.
	 */
	forkMode(forkMode) {
		assert(forkMode >= 0);
		this._forkMode = forkMode;
		return this;
	}

	/**
	 * @param {number} seed - sets libFuzzer's seed (-seed=<seed>)
	 */
	seed(seed) {
		this._seed = seed;
		return this;
	}

	/**
	 * @param {string} jestTestFile
	 */
	jestTestFile(jestTestFile) {
		this._jestTestFile = jestTestFile;
		return this;
	}

	/**
	 * @param {string} jestTestName
	 */
	jestTestName(jestTestName) {
		this._jestTestName = jestTestName;
		return this;
	}

	/**
	 * @param {boolean} jestRunInFuzzingMode
	 */
	jestRunInFuzzingMode(jestRunInFuzzingMode) {
		this._jestRunInFuzzingMode = jestRunInFuzzingMode;
		return this;
	}

	/**
	 * @param {string[]} dictionaries
	 */
	dictionaries(dictionaries) {
		this._dictionaries = dictionaries;
		return this;
	}

	coverage(coverage = true) {
		this._coverage = coverage;
		return this;
	}

	expectedErrors(...expectedError) {
		this._expectedErrors = expectedError;
		return this;
	}

	asJson(asJson = true) {
		this._asJson = asJson;
		return this;
	}

	timeout(timeout) {
		this._timeout = timeout;
		return this;
	}

	build() {
		if (this._jestTestFile === "" && this._fuzzEntryPoint === "") {
			throw new Error("fuzzEntryPoint or jestTestFile are not set.");
		}
		if (this._fuzzEntryPoint !== "" && this._jestTestFile !== "") {
			throw new Error(
				"fuzzEntryPoint and jestTestFile are both set. Please specify only one.",
			);
		}
		return new FuzzTest(
			this._logTestOutput,
			this._includes,
			this._excludes,
			this._customHooks,
			this._dictionaries,
			this._dir,
			this._disableBugDetectors,
			this._dryRun,
			this._forkMode,
			this._fuzzEntryPoint,
			this._fuzzFile,
			this._jestRunInFuzzingMode,
			this._jestTestFile,
			this._jestTestName,
			this._runs,
			this._seed,
			this._sync,
			this._verbose,
			this._listFuzzTestNames,
			this._listFuzzTestNamesPattern,
			this._coverage,
			this._expectedErrors,
			this._asJson,
			this._timeout,
		);
	}
}

/**
 * libFuzzer tends to call the test function at least twice: once with empty data; and subsequent times with user data.
 * If the test function generates a directory, it will fail with error "EEXIST: file already exists, mkdir '...'" on the
 * second call. Thus, we call only once.
 * @param fn - fuzz function to be called once
 * @param callOnIteration - the function will be called once on this iteration
 */
function makeFnCalledOnce(fn, callOnIteration = 0) {
	let iteration = 0;
	assert(callOnIteration >= 0, "callOnIteration must be >= 0");

	return async (data) => {
		if (iteration !== callOnIteration) {
			iteration++;
			return;
		}
		iteration++;

		return fn(data);
	};
}

/**
 * Calls the given function after the given timeout. Any exceptions thrown by the function are swallowed.
 * @param fn
 * @param timeout
 * @returns {Promise<unknown>}
 */
function callWithTimeout(fn, timeout) {
	return new Promise((resolve) => {
		setTimeout(() => {
			try {
				fn();
			} catch (ignored) {
				// Swallow exception to force out of band notification of finding.
			} finally {
				resolve();
			}
		}, timeout);
	});
}

/**
 * Returns a Jest describe function that is skipped if the current platform is not the given one.
 */
function describeSkipOnPlatform(platform) {
	return process.platform === platform ? global.describe.skip : global.describe;
}

async function getFiles(dir) {
	const result = [];
	const files = await fs.promises.readdir(dir);
	for (const file of files) {
		const filepath = path.join(dir, file);
		result.push(filepath);
		if ((await fs.promises.stat(filepath)).isDirectory()) {
			result.push(...(await getFiles(filepath)));
		}
	}
	return result;
}

async function fileExists(path) {
	return !!(await fs.promises.stat(path).catch((_) => false));
}

const CRASH_FILE_PATTERN = /(crash|timeout)-[0-9a-f]{40}/;

async function cleanCrashFilesIn(path) {
	let cleanedFiles = [];
	for (const file of await getFiles(path)) {
		if (file.match(CRASH_FILE_PATTERN)) {
			await fs.promises.rm(file, { force: true });
			cleanedFiles.push(file);
		}
	}
	return cleanedFiles;
}

module.exports = {
	FuzzTestBuilder,
	FuzzingExitCode,
	TimeoutExitCode,
	JestRegressionExitCode,
	makeFnCalledOnce,
	callWithTimeout,
	describeSkipOnPlatform,
	fileExists,
	cleanCrashFilesIn,
};
