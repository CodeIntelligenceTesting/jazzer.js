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

// Register bug detectors based on the provided list of bug detectors
// eslint-disable-next-line @typescript-eslint/ban-types
import { registerCommandInjectionBugDetector } from "./CommandInjection";
export { commandInjectionEvilCommand } from "./CommandInjection";

export async function registerBugDetectors(
	bugDetectors: string[],
	saveFirstBugDetectorException: (e: Error, trimErrorStackLines: number) => void
): Promise<void> {
	// Keep track of registered bug detectors to avoid registering the same bug detector multiple times.
	const registeredBugDetectors: string[] = [];
	for (let i = 0; i < bugDetectors.length; i++) {
		if (registeredBugDetectors.includes(bugDetectors[i])) {
			continue;
		}
		switch (bugDetectors[i]) {
			case "commandInjectionSafe":
				registeredBugDetectors.push(bugDetectors[i]);
				await registerCommandInjectionBugDetector(
					saveFirstBugDetectorException,
					false
				);
				break;
			case "commandInjection":
				registeredBugDetectors.push(bugDetectors[i]);
				await registerCommandInjectionBugDetector(
					saveFirstBugDetectorException,
					true
				);
				break;
		}
	}
}

export async function hookBuiltInFunction<
	// eslint-disable-next-line @typescript-eslint/ban-types
	F extends Function,
	// eslint-disable-next-line @typescript-eslint/ban-types
	K extends Function
>(moduleName: string, targetFnName: string, replacementFn: F): Promise<K> {
	const { default: module } = await import(moduleName);
	//const module = require (moduleName);
	const originalFn = module[targetFnName];
	delete module[targetFnName];
	module[targetFnName] = function (...args: unknown[]) {
		return replacementFn(originalFn, ...args);
	};
	return originalFn;
}

// We keep the original functions in case we want to use them internally.
// TODO: Internally Jazzer.js should use original unhooked builtin functions.
export type OriginalFnInfo = [string, string, (...args: unknown[]) => unknown];
