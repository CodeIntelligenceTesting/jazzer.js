import { transformSync } from "@babel/core";
import { hookRequire } from "istanbul-lib-hook";
import { codeCoverage } from "./plugins/codeCoverage";

export function registerInstrumentor(includes: string[], excludes: string[]) {
	hookRequire(shouldInstrument(includes, excludes), instrumentCode);
}

export function shouldInstrument(
	includes: string[],
	excludes: string[]
): (filepath: string) => boolean {
	return (filepath: string) => {
		const included =
			includes.find((include) => filepath.includes(include)) !== undefined;
		const excluded =
			excludes.find((exclude) => filepath.includes(exclude)) !== undefined;
		return included && !excluded;
	};
}

function instrumentCode(code: string): string {
	const output = transformSync(code, {
		plugins: [codeCoverage],
	});
	return output?.code || code;
}
