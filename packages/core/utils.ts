/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import path from "path";
import process from "process";

import * as fuzzer from "@jazzer.js/fuzzer";

export interface FuzzModule {
	[fuzzEntryPoint: string]: fuzzer.FuzzTarget;
}

export async function importModule(name: string): Promise<FuzzModule | void> {
	return import(name);
}

export function replaceAll(
	text: string,
	pattern: RegExp,
	replacer: string | ((substring: string) => string),
): string {
	// Don't use replaceAll to support node v14.
	let previous = text;
	let current = previous;
	do {
		previous = current;
		// Without explicit cast TS can not figure out that both types of replacer are valid.
		current = previous.replace(pattern, replacer as string);
	} while (current !== previous);
	return current;
}

export function ensureFilepath(filePath: string): string {
	if (!filePath || filePath.length === 0) {
		throw Error("Empty filepath provided");
	}
	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);
	// file: schema is required on Windows
	const fullPath = "file://" + absolutePath;
	return [".js", ".mjs", ".cjs"].some((suffix) => fullPath.endsWith(suffix))
		? fullPath
		: fullPath + ".js";
}

/**
 * Transform arguments to common format, add compound properties and
 * remove framework specific ones, so that the result can be passed on to the
 * regular option handling code.
 *
 * The function is extracted to "utils" as importing "cli" in tests directly
 * tries to parse command line arguments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prepareArgs(args: any) {
	const options = {
		...args,
		fuzzTarget: ensureFilepath(args.fuzzTarget),
		fuzzerOptions: (args.corpus ?? [])
			.concat(args._)
			.map((e: unknown) => e + ""),
	};
	delete options._;
	delete options.corpus;
	delete options.$0;
	return options;
}
