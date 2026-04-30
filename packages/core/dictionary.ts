/*
 * Copyright 2026 Code Intelligence GmbH
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

import { getOrSetJazzerJsGlobal } from "./globals";

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
	globalThis.JazzerJS ??= new Map();
	return getOrSetJazzerJsGlobal("dictionary", new Dictionary());
}

export function addDictionary(...dictionary: string[]) {
	getDictionary().addEntries(dictionary);
}

/**
 * Escapes a byte array to a string that can be used in a libFuzzer dictionary.
 * The format is a double-quoted string with escaped hex bytes.
 * @param byteArray
 * @returns The escaped string.
 *
 * Example:
 *    new Uint8Array([0,1,2,3]) will be converted to '"\\x00\\x01\\x02\\x03"'
 * Example:
 *    "Amazing" will be converted to '"\\x41\\x6d\\x61\\x7a\\x69\\x6e\\x67"'
 */
export function toEscapedString(byteArray: Uint8Array | Int8Array): string {
	return (
		'"' +
		Array.from(byteArray, (byte) => {
			return "\\x" + byte.toString(16).padStart(2, "0");
		}).join("") +
		'"'
	);
}

export function convertDictionaryEntry(
	entry: string | Uint8Array | Int8Array,
): string {
	// Strings are converted to UTF-8 Uint8Arrays before escaping all according to libFuzzer dictionary format.
	// Background: Strings are encoded to UTF-8 here, which matches the way strings are produced from bytes by
	// the FuzzedDataProvider (by default), as well as the encoding used with sanitizer trace hooks for string
	// comparisons (see packages/fuzzer/trace.ts).
	return toEscapedString(
		typeof entry === "string" ? new TextEncoder().encode(entry) : entry,
	);
}

export function useDictionaryByParams(
	options: string[],
	additionalDictionaryEntries: (string | Uint8Array | Int8Array)[] = [],
): string[] {
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
		return options.concat("-dict=" + dictFile.name);
	}
	return options;
}
