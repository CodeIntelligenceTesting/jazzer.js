/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
	return getOrSetJazzerJsGlobal("dictionary", new Dictionary());
}

export function addDictionary(...dictionary: string[]) {
	getDictionary().addEntries(dictionary);
}

export function useDictionaryByParams(options: string[]): string[] {
	const opts = [...options];
	const dictionary = getDictionary().entries;

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
