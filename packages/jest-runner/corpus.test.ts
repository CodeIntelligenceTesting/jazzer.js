/*
 * Copyright 2022 Code Intelligence GmbH
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

// Cleanup created files on exit
tmp.setGracefulCleanup();

describe("Corpus", () => {
	let tmpFile: tmp.FileResult;

	beforeEach(() => {
		tmpFile = tmp.fileSync({ postfix: ".js" });
	});

	describe("inputDirectory", () => {
		it("based on test name", () => {
			const testFile = path.parse(tmpFile.name);

			const corpus = new Corpus(tmpFile.name, []);

			const inputDir = path.parse(corpus.inputDirectory);
			expect(inputDir.name).toEqual(testFile.name);
			expect(inputDir.dir).toEqual(testFile.dir);
			expect(inputDir.ext).toBeFalsy();
		});

		it("based on test state elements", () => {
			const testFile = path.parse(tmpFile.name);

			const corpus = new Corpus(tmpFile.name, ["describe", "sub", "fuzz"]);

			const inputDir = path.parse(corpus.inputDirectory);
			expect(inputDir.name).toEqual("fuzz");
			expect(inputDir.dir).toEqual(
				testFile.dir +
					path.sep +
					testFile.name +
					path.sep +
					"describe" +
					path.sep +
					"sub"
			);
			expect(inputDir.ext).toBeFalsy();
		});
	});

	describe("outputDirectory", () => {
		it("same as input", () => {
			const corpus = new Corpus(tmpFile.name, []);
			expect(corpus.inputDirectory + path.sep).toEqual(corpus.outputDirectory);
		});
	});
});
