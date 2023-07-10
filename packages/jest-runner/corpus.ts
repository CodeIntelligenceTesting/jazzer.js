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

import path from "path";
import fs from "fs";

export class Corpus {
	static readonly defaultCorpusDirectory = ".cifuzz-corpus";

	// Directory containing manually generated user seeds and found
	// fuzzer inputs (crash, timeout, ...).
	private readonly _seedInputsDirectory: string;
	// Directory containing runtime generated fuzzer inputs.
	private readonly _generatedInputsDirectory: string;

	constructor(testSourceFilePath: string, testJestPathElements: string[]) {
		this._seedInputsDirectory = directoryPathForTest(
			testSourceFilePath,
			testJestPathElements,
		);
		this._generatedInputsDirectory = directoryPathForTest(
			testSourceFilePath,
			testJestPathElements,
			Corpus.defaultCorpusDirectory,
		);
		this.createMissingDirectories();
	}

	get seedInputsDirectory(): string {
		return this._seedInputsDirectory;
	}

	get generatedInputsDirectory(): string {
		return this._generatedInputsDirectory;
	}

	inputsPaths(): [string, string][] {
		return fs
			.readdirSync(this._seedInputsDirectory)
			.filter(
				(entry) =>
					!fs
						.lstatSync(path.join(this.seedInputsDirectory, entry))
						.isDirectory(),
			)
			.map((file) => [file, path.join(this._seedInputsDirectory, file)]);
	}

	private createMissingDirectories() {
		fs.mkdirSync(this._seedInputsDirectory, { recursive: true });
		fs.mkdirSync(this._generatedInputsDirectory, { recursive: true });
	}
}

const directoryPathForTest = (
	testSourceFilePath: string,
	testJestPathElements: string[],
	addToProjectRoot = "",
): string => {
	const rootDirectory = buildRootDirectory(
		testSourceFilePath,
		addToProjectRoot,
	);
	const safeTestJestPathElements = testJestPathElements.map(
		replaceSpacesWithUnderscore,
	);
	return path.join(rootDirectory, ...safeTestJestPathElements, path.sep);
};

const buildRootDirectory = (
	testSourceFilePath: string,
	projectCorpusRoot: string,
): string => {
	const inputsRoot = path.parse(testSourceFilePath);
	const testName = inputsRoot.name;
	let mainDir = inputsRoot.dir;
	if (projectCorpusRoot !== "") {
		// looking for the root directory of the project
		mainDir = path.join(
			findDirectoryWithPackageJson(inputsRoot).dir,
			projectCorpusRoot,
			testName,
		);
	} else {
		mainDir = path.join(inputsRoot.dir, testName);
	}
	return mainDir;
};

const findDirectoryWithPackageJson = (
	directory: path.ParsedPath,
): path.ParsedPath => {
	while (!fs.readdirSync(directory.dir).includes("package.json")) {
		directory = path.parse(directory.dir);
		if (directory.dir === directory.root) {
			throw new Error("Could not find package.json in any parent directory");
		}
	}

	return directory;
};

const replaceSpacesWithUnderscore = (s: string): string => {
	return s.replace(/ /g, "_");
};
