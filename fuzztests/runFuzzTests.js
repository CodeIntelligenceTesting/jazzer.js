#!/usr/bin/node
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

// Helper script that searches for Jest fuzz tests in the current directory and
// executes them in new processes using the found fuzz test names.

const { spawn } = require("child_process");
const fs = require("fs/promises");

const fuzzTestFileExtension = "fuzz.js";
const fuzzTestNameRegex = /it.fuzz\s*\(\s*"(.*)"/g;

async function findFuzzTestNamesInFile(file) {
	const fuzzTestNames = [];
	if (file.endsWith(fuzzTestFileExtension)) {
		const content = await fs.readFile(file);
		for (let match of content.toString().matchAll(fuzzTestNameRegex)) {
			fuzzTestNames.push(match[1]);
		}
	}
	return fuzzTestNames;
}

async function findFuzzTestNamesInDir(dir) {
	const files = await fs.readdir(dir);
	let fuzzTests = {};
	for (const file of files) {
		const fuzzTestNames = await findFuzzTestNamesInFile(file);
		if (fuzzTestNames.length) {
			fuzzTests[file] = fuzzTestNames;
		}
	}
	return fuzzTests;
}

async function executeFuzzTest(file, name) {
	console.log(`--- Executing fuzz test ${file} > ${name}`);
	return new Promise((resolve, reject) => {
		process.env["JAZZER_FUZZ"] = "1";
		let test = spawn("npm", ["test", "--", `--testNamePattern='${name}'`], {
			stdio: "inherit",
		});
		test.on("error", (error) => {
			console.log(`ERROR: ${error.message}`);
			reject(error);
		});
		test.on("close", (code) => {
			console.log(`--- Finished fuzz test ${file} > ${name} with code ${code}`);
			if (code !== 0 && code !== null) {
				reject(code);
			} else {
				resolve();
			}
		});
	});
}

async function runFuzzTestsInDir(dir, mode) {
	const fuzzTests = await findFuzzTestNamesInDir(dir);
	if (mode === "async") {
		return Promise.all(
			Object.entries(fuzzTests).map(([file, names]) =>
				Promise.all(names.map((name) => executeFuzzTest(file, name))),
			),
		);
	} else {
		for (const [file, names] of Object.entries(fuzzTests)) {
			for (let name of names) {
				await executeFuzzTest(file, name);
			}
		}
	}
}

// Change into script / requested dir to simplify file handling
process.chdir(process.argv[3] || __dirname);

runFuzzTestsInDir(".", process.argv[2]).then(
	() => {
		console.log("DONE");
	},
	(e) => {
		console.log("ERROR:", e);
		process.exit(79);
	},
);
