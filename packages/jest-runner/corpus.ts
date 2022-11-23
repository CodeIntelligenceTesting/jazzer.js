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
	private readonly _inputDirectory: string;
	private readonly _outputDirectory: string;

	constructor(testPath: string, testStateElements: string[]) {
		this._inputDirectory = this.buildInputDirectory(
			testPath,
			testStateElements
		);
		this._outputDirectory = this.buildOutputDirectory(this._inputDirectory);
		fs.mkdirSync(this._inputDirectory, { recursive: true });
		fs.mkdirSync(this._outputDirectory, { recursive: true });
	}

	get inputDirectory(): string {
		return this._inputDirectory;
	}

	get outputDirectory(): string {
		return this._outputDirectory;
	}

	inputPaths(): [string, string][] {
		return fs.readdirSync(this._inputDirectory).map((file) => {
			return [file, path.join(this._inputDirectory, file)];
		});
	}

	private buildOutputDirectory(inputDirectory: string): string {
		return inputDirectory + path.sep;
	}

	private buildInputDirectory(
		testPath: string,
		testStateElements: string[]
	): string {
		const root = path.parse(testPath);
		const testElements = testStateElements.map(
			this.replaceSpacesWithUnderscore
		);
		return path.join(root.dir, root.name, ...testElements);
	}

	private replaceSpacesWithUnderscore(s: string): string {
		return s.replace(/ /g, "_");
	}
}
