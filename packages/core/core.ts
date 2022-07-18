/* eslint no-var: 0 */
import * as fuzzer from "@fuzzy-eagle/fuzzer";
import { registerInstrumentor } from "@fuzzy-eagle/instrumentor";

interface Options {
	fuzzTarget: string;
	fuzzFunction: string;
	includes: string[];
	excludes: string[];
	fuzzerOptions: string[];
}

declare global {
	var Fuzzer: fuzzer.Fuzzer;
}

export function startFuzzing(options: Options) {
	globalThis.Fuzzer = fuzzer.fuzzer;
	registerInstrumentor(options.includes, options.excludes);

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const fuzzFn = require(options.fuzzTarget)[options.fuzzFunction];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${options.fuzzTarget} does not export function "${options.fuzzFunction}"`
		);
	}
	Fuzzer.startFuzzing(fuzzFn, options.fuzzerOptions);
}
