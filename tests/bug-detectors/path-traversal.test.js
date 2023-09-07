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

const { FuzzTestBuilder, FuzzingExitCode } = require("../helpers.js");
const path = require("path");
const fs = require("fs");

describe("Path Traversal", () => {
	const SAFE = "../safe_path/";
	const EVIL = "../evil_path/";

	beforeEach(() => {
		fs.rmSync(SAFE, { recursive: true, force: true });
	});

	const bugDetectorDirectory = path.join(__dirname, "path-traversal");

	it("openSync with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("PathTraversalFsOpenEvilSync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
	});

	it("open with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalFsOpenEvilAsync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
	});

	it("mkdirSync with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("PathTraversalFsMkdirEvilSync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(EVIL)).toBeFalsy();
		expect(fs.existsSync(SAFE)).toBeFalsy();
	});

	it("mkdirSync with SAFE path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("PathTraversalFsMkdirSafeSync")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(SAFE)).toBeTruthy();
		expect(fs.existsSync(EVIL)).toBeFalsy();
	});

	it("mkdirAsync with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalFsMkdirEvilAsync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(EVIL)).toBeFalsy();
		expect(fs.existsSync(SAFE)).toBeFalsy();
	});

	it("mkdirAsync with SAFE path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalFsMkdirSafeAsync")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(SAFE)).toBeTruthy();
		expect(fs.existsSync(EVIL)).toBeFalsy();
	});

	it("mkdir PROMISES with SAFE path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalFspMkdirSafeAsync")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
		expect(fs.existsSync(SAFE)).toBeTruthy();
		expect(fs.existsSync(EVIL)).toBeFalsy();
	});

	it("mkdir PROMISES with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalFspMkdirEvilAsync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
		expect(fs.existsSync(EVIL)).toBeFalsy();
		expect(fs.existsSync(SAFE)).toBeFalsy();
	});

	it("open PROMISES with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalFspOpenEvilAsync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
	});

	it("joinSync with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("PathTraversalJoinEvilSync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
	});

	it("joinSync with SAFE path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("PathTraversalJoinSafeSync")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
	});

	it("join with EVIL path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalJoinEvilAsync")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => {
			fuzzTest.execute();
		}).toThrow(FuzzingExitCode);
	});

	it("join with SAFE path", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(false)
			.fuzzEntryPoint("PathTraversalJoinSafeAsync")
			.dir(bugDetectorDirectory)
			.build();
		fuzzTest.execute();
	});
});

describe("Path Traversal invalid input", () => {
	const bugDetectorDirectory = path.join(__dirname, "path-traversal");
	const errorMessage =
		/TypeError: The ".*" argument must be of type string or an instance of Buffer or URL./;

	it("Invalid args to open", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("invalidArgsToOpen")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => fuzzTest.execute()).toThrow();
		expect(fuzzTest.stderr).toMatch(errorMessage);
	});

	it("Invalid first arg to cp", () => {
		const fuzzTest = new FuzzTestBuilder()
			.runs(0)
			.sync(true)
			.fuzzEntryPoint("invalidArgsToCp")
			.dir(bugDetectorDirectory)
			.build();
		expect(() => fuzzTest.execute()).toThrow();
		// 'TypeError: The "src" argument must be of type string or an instance of Buffer or URL.',
		// however the string "src" may vary from system to system, so a regexp is better
		expect(fuzzTest.stderr).toMatch(errorMessage);
	});
});
