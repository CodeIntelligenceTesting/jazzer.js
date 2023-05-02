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
import { registerCommandInjectionBugDetector } from "./command-injection";

export class BugDetectorError extends Error {}

// TODO: Internally Jazzer.js should use original unhooked builtin functions.
export type OriginalFnInfo = [string, string, (...args: unknown[]) => unknown];

/**
 * Registers bug detectors based on the provided list of bug detectors.
 */
export async function registerBugDetectors(
	bugDetectors: string[]
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
				await registerCommandInjectionBugDetector(false);
				break;
			case "commandInjection":
				registeredBugDetectors.push(bugDetectors[i]);
				await registerCommandInjectionBugDetector(true);
				break;
		}
	}
}

/**
 * Replaces a built-in function with a custom implementation while preserving
 * the original function for potential use within the replacement function.
 *
 * @param moduleName - The name of the module containing the target function.
 * @param targetFnName - The name of the target function to be replaced.
 * @param replacementFn - The replacement function that will be called instead
 *                        of the original function. The first argument passed
 *                        to the replacement function will be the original function,
 *                        followed by any arguments that were originally passed
 *                        to the target function.
 * @returns A promise that resolves to the original function that was replaced.
 * @throws Will throw an error if the module cannot be imported.
 *
 * @example
 * const originalExec = await hookBuiltInFunction(
 *   "child_process",
 *   "exec",
 *   (originalFn: Function, cmd: string, options: object, callback: Function) => {
 *     console.log("Custom implementation called with command:", cmd);
 *     return originalFn(cmd, options, callback);
 *   }
 * );
 */
export async function hookBuiltInFunction<
	// eslint-disable-next-line @typescript-eslint/ban-types
	F extends Function,
	// eslint-disable-next-line @typescript-eslint/ban-types
	K extends Function
>(moduleName: string, targetFnName: string, replacementFn: F): Promise<K> {
	const { default: module } = await import(moduleName);
	const originalFn = module[targetFnName];
	delete module[targetFnName];
	module[targetFnName] = (...args: unknown[]) =>
		replacementFn(originalFn, ...args);
	return originalFn;
}

// This is checked by the core after each fuzzer iteration.
let bugDetectorError: BugDetectorError | undefined;

export function getFirstBugDetectorError(): BugDetectorError | undefined {
	return bugDetectorError;
}

// Clear the error saved by the bug detector before the fuzzer continues with a new input.
export function clearFirstBugDetectorError(): void {
	bugDetectorError = undefined;
}

export function saveFirstBugDetectorError(
	error: BugDetectorError,
	trimErrorStackLines = 0
): void {
	// After an error has been saved, ignore all subsequent errors.
	if (bugDetectorError) {
		return;
	}
	error.stack = error.stack
		//?.replace(e.message, "")
		?.split("\n")
		.slice(trimErrorStackLines)
		.join("\n");
	bugDetectorError = error;
	return;
}
