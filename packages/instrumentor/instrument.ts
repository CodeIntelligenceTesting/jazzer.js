import { transformSync } from "@babel/core";
import { codeCoverage } from "./plugins/codeCoverage";

const { hookRequire } = require("istanbul-lib-hook"); // eslint-disable-line @typescript-eslint/no-var-requires

hookRequire(shouldInstrument, instrumentCode);

export function instrumentCode(code: string): string {
	const output = transformSync(code, {
		plugins: [codeCoverage],
	});
	return output?.code || code;
}

function shouldInstrument(filepath: string): boolean {
	return !filepath.includes("node_modules");
}

export function instrument(fuzzTargetPath: string) {
	const fuzzFn = require(fuzzTargetPath).fuzz; // eslint-disable-line @typescript-eslint/no-var-requires

	if (typeof fuzzFn !== "function") {
		throw new Error(`${fuzzTargetPath} has no fuzz function exported`);
	}
	console.log(`fuzzing ${typeof fuzzFn}`);
}
