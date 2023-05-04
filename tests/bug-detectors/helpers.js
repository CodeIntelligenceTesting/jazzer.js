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
const process = require("process");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const assert = require("assert");

class FuzzTest {
	sync;
	runs;
	verbose;
	fuzzEntryPoint;
	dir;
	bugDetectorActivationFlag;
	forkMode;
	seed;
	jestTestFile;
	jestTestNamePattern;
	jestRunInFuzzingMode;

	/**
	 * @param {boolean} sync
	 * @param {number} runs
	 * @param {boolean} verbose
	 * @param {string} fuzzEntryPoint
	 * @param {string} dir
	 * @param {string} bugDetectorActivationFlag
	 * @param {number} forkMode
	 * @param {number} seed
	 * @param {string} jestTestFile
	 * @param {string} jestTestName
	 * @param {boolean} jestRunInFuzzingMode
	 */
	constructor(
		sync,
		runs,
		verbose,
		fuzzEntryPoint,
		dir,
		bugDetectorActivationFlag,
		forkMode,
		seed,
		jestTestFile,
		jestTestName,
		jestRunInFuzzingMode
	) {
		this.sync = sync;
		this.runs = runs;
		this.verbose = verbose;
		this.fuzzEntryPoint = fuzzEntryPoint;
		this.dir = dir;
		this.bugDetectorActivationFlag = bugDetectorActivationFlag;
		this.forkMode = forkMode;
		this.seed = seed;
		this.jestTestFile = jestTestFile;
		this.jestTestNamePattern = jestTestName;
		this.jestRunInFuzzingMode = jestRunInFuzzingMode;
	}

	execute() {
		if (this.jestTestFile !== "") {
			this.executeWithJest();
			return;
		}
		const options = ["jazzer", "fuzz"];
		options.push("-f " + this.fuzzEntryPoint);
		if (this.sync) options.push("--sync");
		options.push("--bugDetectors=" + this.bugDetectorActivationFlag);
		options.push("--");
		options.push("-runs=" + this.runs);
		if (this.forkMode) options.push("-fork=" + this.forkMode);
		options.push("-seed=" + this.seed);
		const proc = spawnSync("npx", options, {
			stdio: "pipe",
			cwd: this.dir,
			shell: true,
			windowsHide: true,
		});
		if (this.verbose) {
			console.log("STDOUT: " + proc.stdout.toString());
			console.log("STDERR: " + proc.stderr.toString());
			console.log("STATUS: " + proc.status);
		}
		if (proc.status !== 0 && proc.status !== null) {
			throw new Error(proc.status.toString());
		}
	}

	executeWithJest() {
		// Put together the jest config.
		const config = {
			sync: this.sync,
			bugDetectors: [this.bugDetectorActivationFlag],
			fuzzerOptions: ["-runs=" + this.runs, "-seed=" + this.seed],
		};

		// Write jest config file even if it exists
		fs.writeFileSync(
			path.join(this.dir, ".jazzerjsrc.json"),
			JSON.stringify(config)
		);
		const cmd = "npx";
		const options = [
			"jest",
			this.jestTestFile,
			'--testNamePattern="' + this.jestTestNamePattern + '"',
		];
		let env = { ...process.env };
		if (this.jestRunInFuzzingMode) {
			env.JAZZER_FUZZ = "1";
		}
		const proc = spawnSync(cmd, options, {
			stdio: "pipe",
			cwd: this.dir,
			shell: true,
			windowsHide: true,
			env: env,
		});
		if (this.verbose) {
			console.log("STDOUT: " + proc.stdout.toString());
			console.log("STDERR: " + proc.stderr.toString());
			console.log("STATUS: " + proc.status);
		}
		if (proc.status !== 0 && proc.status !== null) {
			throw new Error(proc.status.toString());
		}
	}
}

class FuzzTestBuilder {
	_sync = false;
	_runs = 0;
	_verbose = true;
	_fuzzEntryPoint = "";
	_dir = "";
	_bugDetectorActivationFlag = "";
	_forkMode = 0;
	_seed = 100;
	_jestTestFile = "";
	_jestTestName = "";
	_jestRunInFuzzingMode = false;

	/**
	 * @param {boolean} sync
	 */
	sync(sync) {
		this._sync = sync;
		return this;
	}

	/**
	 * @param {number} runs
	 */
	runs(runs) {
		this._runs = runs;
		return this;
	}

	/**
	 * @param {boolean} verbose
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
	 * @param {string} dir
	 */
	dir(dir) {
		this._dir = dir;
		return this;
	}

	/**
	 * @param {string} flag
	 */
	bugDetectorActivationFlag(flag) {
		this._bugDetectorActivationFlag = flag;
		return this;
	}

	/**
	 * @param {number} forkMode
	 */
	forkMode(forkMode) {
		assert(forkMode >= 0);
		this._forkMode = forkMode;
		return this;
	}

	/**
	 * @param {number} seed
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

	build() {
		if (this._jestTestFile === "" && this._fuzzEntryPoint === "") {
			throw new Error("fuzzEntryPoint or jestTestFile are not set.");
		}
		if (this._fuzzEntryPoint !== "" && this._jestTestFile !== "") {
			throw new Error(
				"fuzzEntryPoint and jestTestFile are both set. Please specify only one."
			);
		}
		return new FuzzTest(
			this._sync,
			this._runs,
			this._verbose,
			this._fuzzEntryPoint,
			this._dir,
			this._bugDetectorActivationFlag,
			this._forkMode,
			this._seed,
			this._jestTestFile,
			this._jestTestName,
			this._jestRunInFuzzingMode
		);
	}
}

module.exports.FuzzTestBuilder = FuzzTestBuilder;
module.exports.FuzzTest = FuzzTest;
