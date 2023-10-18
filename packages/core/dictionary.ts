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

import { getOrSetJazzerJsGlobal } from "./api";

/**
 * Dictionaries can be used to provide additional mutation suggestions to the
 * fuzzer.
 */
export class Dictionary {
	private _entries: string[] = [];

	get entries() {
		return [...this._entries];
	}

	addEntries(dictionary: string[]) {
		this._entries.push(...dictionary);
	}
}

function getDictionary(): Dictionary {
	return getOrSetJazzerJsGlobal("dictionary", new Dictionary());
}

export function addDictionary(...dictionary: string[]) {
	getDictionary().addEntries(dictionary);
}

/* Convert Uint8Array of the form int8Array(3) [65, 109,  97] to String of the form "\"\\x41\\x6d\\x61\"" that can be
 * decoded by libfuzzer. */
function toEscapedHexString(byteArray: Uint8Array | Int8Array): string {
	if (0 == byteArray.length) {
		return '""';
	}
	return (
		'"\\x' +
		Array.from(byteArray, function (byte) {
			return ("0" + (byte & 0xff).toString(16)).slice(-2);
		}).join("\\x") +
		'"'
	);
}

function convertDictionaryEntry(
	entry: string | Uint8Array | Int8Array,
): string {
	if ("string" == typeof entry) {
		return JSON.stringify(entry);
	} else {
		return toEscapedHexString(entry);
	}
}

export function useDictionaryByParams(
	options: string[],
	additionalDictionaryEntries: (string | Uint8Array | Int8Array)[] = [],
): string[] {
	const opts = [...options];

	const additionalDictionary = additionalDictionaryEntries.map(
		convertDictionaryEntry,
	);

	const dictionary = getDictionary().entries.concat(additionalDictionary);

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
