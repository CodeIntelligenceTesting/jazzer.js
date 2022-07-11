import { transformSync } from "@babel/core";
import { shouldInstrument } from "./matcher";
import { codeCoverage } from "./plugins/codeCoverage";
import { Fuzzer } from "@fuzzy-eagle/fuzzer";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hookRequire } = require("istanbul-lib-hook");

export interface InstrumentationOptions {
	fuzzFunction: string;
	includes: string[];
	excludes: string[];
	fuzzerOptions: string[];
}

function instrumentCode(code: string): string {
	const output = transformSync(code, {
		plugins: [codeCoverage],
	});
	return output?.code || code;
}

export function instrument(
	fuzzTargetPath: string,
	options: InstrumentationOptions
) {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const fuzzFn = require(fuzzTargetPath)[options.fuzzFunction];
	if (typeof fuzzFn !== "function") {
		throw new Error(
			`${fuzzTargetPath} has no fuzz function "${options.fuzzFunction}" exported`
		);
	}

	hookRequire(
		shouldInstrument(options.includes, options.excludes),
		instrumentCode
	);

	Fuzzer.startFuzzing(fuzzFn, options.fuzzerOptions);
}
