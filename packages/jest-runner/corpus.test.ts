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

import { Corpus } from "./corpus";
import * as tmp from "tmp";
import path from "path";
import fs from "fs";

// Cleanup created files on exit
tmp.setGracefulCleanup();

describe("Corpus", () => {
	describe("inputsDirectory", () => {
		it("creates dir based on test name", () => {
			const fuzzTest = mockFuzzTest();

			const corpus = new Corpus(fuzzTest, []);

			const testFile = path.parse(fuzzTest);
			const inputsDir = path.parse(corpus.seedInputsDirectory);
			expect(inputsDir.name).toEqual(testFile.name);
			expect(inputsDir.dir).toEqual(testFile.dir);
			expect(inputsDir.ext).toBeFalsy();
			expect(fs.existsSync(corpus.seedInputsDirectory)).toBeTruthy();
		});

		it("creates dir based on Jest path elements", () => {
			const fuzzTest = mockFuzzTest();

			const corpus = new Corpus(fuzzTest, ["describe", "sub", "fuzz"]);

			const testFile = path.parse(fuzzTest);
			const inputsDir = path.parse(corpus.seedInputsDirectory);
			expect(inputsDir.name).toEqual("fuzz");
			expect(inputsDir.dir).toEqual(
				[testFile.dir, testFile.name, "describe", "sub"].join(path.sep),
			);
			expect(inputsDir.ext).toBeFalsy();
			expect(fs.existsSync(corpus.seedInputsDirectory)).toBeTruthy();
		});
	});

	describe("inputsPaths", () => {
		it("list all files in inputs directory", () => {
			const manualSeedFiles = 5;
			const fuzzTest = mockFuzzTest({ seedFiles: manualSeedFiles });

			const corpus = new Corpus(fuzzTest, []);

			expect(corpus.inputsPaths()).toHaveLength(manualSeedFiles);
		});

		it("ignores subdirectories", () => {
			const fuzzTest = mockFuzzTest({ subDirs: 2 });

			const corpus = new Corpus(fuzzTest, []);

			expect(corpus.inputsPaths()).toHaveLength(0);
		});
	});

	describe("corpusDirectory", () => {
		it("make sure a corpus directory is created", () => {
			const fuzzTest = mockFuzzTest();
			const corpus = new Corpus(fuzzTest, []);
			const testFile = path.parse(fuzzTest);
			expect(corpus.generatedInputsDirectory).toEqual(
				path.join(testFile.dir, ".cifuzz-corpus", testFile.name, path.sep),
			);
			expect(fs.existsSync(corpus.generatedInputsDirectory)).toBeTruthy();
		});

		it("throw error if no package.json was found", () => {
			const fuzzTest = mockFuzzTest({ generatePackageJson: false });
			expect(() => new Corpus(fuzzTest, [])).toThrowError();
		});
	});
});

function mockFuzzTest({
	seedFiles = 0,
	subDirs = 0,
	generatePackageJson = true,
} = {}) {
	const tmpDir = tmp.dirSync({ unsafeCleanup: true }).name;
	const fuzzTestName = "fuzztest";
	const fuzzTestFile = path.join(tmpDir, fuzzTestName + ".js");
	fs.writeFileSync(fuzzTestFile, "");
	if (generatePackageJson) {
		fs.writeFileSync(path.join(tmpDir, "package.json"), "");
	}
	if (seedFiles > 0 || subDirs > 0) {
		fs.mkdirSync(path.join(tmpDir, fuzzTestName));
	}
	for (let i = 0; i < seedFiles; i++) {
		fs.writeFileSync(
			path.join(tmpDir, fuzzTestName, i.toString()),
			i.toString(),
		);
	}
	for (let i = 0; i < subDirs; i++) {
		fs.mkdirSync(path.join(tmpDir, fuzzTestName, i.toString()));
	}
	return fuzzTestFile;
}
