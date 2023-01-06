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

import { PluginItem, transformSync } from "@babel/core";
import { hookRequire, TransformerOptions } from "istanbul-lib-hook";
import { codeCoverage } from "./plugins/codeCoverage";
import { compareHooks } from "./plugins/compareHooks";
import { functionHooks } from "./plugins/functionHooks";
import { hookManager } from "@jazzer.js/hooking";

export function registerInstrumentor(includes: string[], excludes: string[]) {
	const shouldInstrument = shouldInstrumentFn(includes, excludes);

	if (includes.includes("jazzer.js")) {
		unloadInternalModules();
	}

	hookRequire(
		() => true,
		(code: string, options: TransformerOptions): string => {
			const transformations: PluginItem[] = [];

			if (shouldInstrument(options.filename)) {
				transformations.push(codeCoverage, compareHooks);
			}
			if (hookManager.hasFunctionsToHook(options.filename)) {
				transformations.push(functionHooks(options.filename));
			}

			if (transformations.length === 0) {
				return code;
			}

			const output = transformSync(code, {
				plugins: transformations,
			});
			return output?.code || code;
		}
	);
}

function unloadInternalModules() {
	console.log(
		"DEBUG: Unloading internal Jazzer.js modules for instrumentation..."
	);
	[
		"@jazzer.js/core",
		"@jazzer.js/fuzzer",
		"@jazzer.js/hooking",
		"@jazzer.js/instrumentor",
		"@jazzer.js/jest-runner",
	].forEach((module) => {
		delete require.cache[require.resolve(module)];
	});
}

export function shouldInstrumentFn(
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
