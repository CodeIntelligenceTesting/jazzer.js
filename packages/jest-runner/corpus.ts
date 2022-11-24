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
	private readonly _inputsDirectory: string;

	constructor(testSourceFilePath: string, testJestPathElements: string[]) {
		this._inputsDirectory = buildInputsDirectory(
			testSourceFilePath,
			testJestPathElements
		);
		this.createMissingDirectories();
	}

	get inputsDirectory(): string {
		return this._inputsDirectory;
	}

	inputsPaths(): [string, string][] {
		return fs
			.readdirSync(this._inputsDirectory)
			.filter(
				(entry) =>
					!fs.lstatSync(path.join(this.inputsDirectory, entry)).isDirectory()
			)
			.map((file) => [file, path.join(this._inputsDirectory, file)]);
	}

	private createMissingDirectories() {
		fs.mkdirSync(this._inputsDirectory, { recursive: true });
	}
}

const buildInputsDirectory = (
	testSourceFilePath: string,
	testJestPathElements: string[]
): string => {
	const root = path.parse(testSourceFilePath);
	const pathElements = testJestPathElements.map(replaceSpacesWithUnderscore);
	return path.join(root.dir, root.name, ...pathElements) + path.sep;
};

const replaceSpacesWithUnderscore = (s: string): string => {
	return s.replace(/ /g, "_");
};
