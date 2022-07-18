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

import { transformSync } from "@babel/core";
import { hookRequire } from "istanbul-lib-hook";
import { codeCoverage } from "./plugins/codeCoverage";
import { compareHooks } from "./plugins/compareHooks";

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
		plugins: [codeCoverage, compareHooks],
	});
	return output?.code || code;
}
