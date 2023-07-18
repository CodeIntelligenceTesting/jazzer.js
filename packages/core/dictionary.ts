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

import fs from "fs";
import tmp from "tmp";

/**
 * Dictionaries can be used to provide additional mutation suggestions to the
 * fuzzer.
 */
export class Dictionaries {
	private _dictionary: string[] = [];

	get dictionary() {
		return this._dictionary;
	}

	addDictionary(dictionary: string[]) {
		this._dictionary.push(...dictionary);
	}
}

const dictionaries = new Dictionaries();

export function addDictionary(...dictionary: string[]) {
	dictionaries.addDictionary(dictionary);
}

export function useDictionaryByParams(options: string[]): string[] {
	const opts = [...options];
	const dictionary = Array.from(dictionaries.dictionary);

	// This diverges from the libFuzzer behavior, which allows only one dictionary (the last one).
	// We merge all dictionaries into one and pass that to libfuzzer.
	for (const option of options) {
		if (option.startsWith("-dict=")) {
			const dict = option.substring(6);
			// Preserve the filename in a comment before merging dictionary contents.
			dictionary.push(`\n# ${dict}:`);
			dictionary.push(fs.readFileSync(dict).toString());
		}
	}

	if (dictionary.length > 0) {
		// Add a comment to the top of the dictionary file.
		dictionary.unshift("# This file was automatically generated. Do not edit.");
		const content = dictionary.join("\n");

		// Use a temporary dictionary file to pass in the merged dictionaries.
		const dictFile = tmp.fileSync({
			mode: 0o700,
			prefix: "jazzer.js",
			postfix: "dict",
		});
		fs.writeFileSync(dictFile.name, content);
		fs.closeSync(dictFile.fd);

		opts.push("-dict=" + dictFile.name);
	}
	return opts;
}
