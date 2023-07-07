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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawnSync } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assert = require("assert");

// This is used to distinguish an error thrown during fuzzing from other errors, such as wrong
// `fuzzEntryPoint` (which would return a "1")
const FuzzingExitCode = "77";
const JestRegressionExitCode = "1";

class FuzzTest {
	sync;
	runs;
	verbose;
	fuzzEntryPoint;
	dir;
	disableBugDetectors;
	forkMode;
	seed;
	jestTestFile;
	jestTestNamePattern;
	jestRunInFuzzingMode;
	coverage;

	constructor(
		sync,
		runs,
		verbose,
		fuzzEntryPoint,
		dir,
		disableBugDetectors,
		forkMode,
		seed,
		jestTestFile,
		jestTestName,
		jestRunInFuzzingMode,
		coverage,
	) {
		this.sync = sync;
		this.runs = runs;
		this.verbose = verbose;
		this.fuzzEntryPoint = fuzzEntryPoint;
		this.dir = dir;
		this.disableBugDetectors = disableBugDetectors;
		this.forkMode = forkMode;
		this.seed = seed;
		this.jestTestFile = jestTestFile;
		this.jestTestNamePattern = jestTestName;
		this.jestRunInFuzzingMode = jestRunInFuzzingMode;
		this.coverage = coverage;
	}

	execute() {
		if (this.jestTestFile !== "") {
			this.executeWithJest();
			return;
		}
		const options = ["jazzer", "fuzz"];
		options.push("-f " + this.fuzzEntryPoint);
		if (this.sync) options.push("--sync");
		for (const bugDetector of this.disableBugDetectors) {
			options.push("--disable_bug_detectors=" + bugDetector);
		}
		if (this.coverage) options.push("--coverage");
		options.push("--");
		options.push("-runs=" + this.runs);
		if (this.forkMode) options.push("-fork=" + this.forkMode);
		options.push("-seed=" + this.seed);
		this.runTest("npx", options, { ...process.env });
	}

	executeWithJest() {
		// Put together the jest config.
		const config = {
			sync: this.sync,
			bugDetectors: this.disableBugDetectors,
			fuzzerOptions: ["-runs=" + this.runs, "-seed=" + this.seed],
		};

		// Write jest config file even if it exists
		fs.writeFileSync(
			path.join(this.dir, ".jazzerjsrc.json"),
			JSON.stringify(config),
		);
		const cmd = "npx";
		const options = [
			"jest",
			this.coverage ? "--coverage" : "",
			this.jestTestFile,
			'--testNamePattern="' + this.jestTestNamePattern + '"',
		];
		let env = { ...process.env };
		if (this.jestRunInFuzzingMode) {
			env.JAZZER_FUZZ = "1";
		}
		this.runTest(cmd, options, env);
	}

	runTest(cmd, options, env) {
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
		if (this.verbose) {
			console.log("STDOUT: " + this.stdout.toString());
			console.log("STDERR: " + this.stderr.toString());
			console.log("STATUS: " + this.status);
		}
		if (this.status !== 0 && this.status !== null) {
			throw new Error(this.status.toString());
		}
	}
}

class FuzzTestBuilder {
	_sync = false;
	_runs = 0;
	_verbose = false;
	_fuzzEntryPoint = "";
	_dir = "";
	_disableBugDetectors = "";
	_forkMode = 0;
	_seed = 100;
	_jestTestFile = "";
	_jestTestName = "";
	_jestRunInFuzzingMode = false;
	_coverage = false;

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
	 * @param {boolean} verbose - whether to print the output of the fuzz test to the console. True by
	 * default.
	 */
	verbose(verbose) {
		this._verbose = verbose;
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

	/**
	 * @param {string[]} bugDetectors - bug detectors to disable. This will set Jazzer.js's command line flag
	 * --disableBugDetectors=bugDetector1 --disableBugDetectors=bugDetector2 ...
	 */
	disableBugDetectors(bugDetectors) {
		this._disableBugDetectors = bugDetectors;
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

	coverage(coverage) {
		this._coverage = coverage;
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
			this._sync,
			this._runs,
			this._verbose,
			this._fuzzEntryPoint,
			this._dir,
			this._disableBugDetectors,
			this._forkMode,
			this._seed,
			this._jestTestFile,
			this._jestTestName,
			this._jestRunInFuzzingMode,
			this._coverage,
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

module.exports.FuzzTestBuilder = FuzzTestBuilder;
module.exports.FuzzingExitCode = FuzzingExitCode;
module.exports.JestRegressionExitCode = JestRegressionExitCode;
module.exports.makeFnCalledOnce = makeFnCalledOnce;
module.exports.callWithTimeout = callWithTimeout;
