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
export { commandInjectionEvilCommand } from "./command-injection";

import { nextFakePC } from "@jazzer.js/instrumentor/dist/plugins/helpers";
import { guideTowardsEquality } from "@jazzer.js/fuzzer";
import { registerCommandInjectionBugDetector } from "./command-injection";

/**
 * Registers bug detectors based on the provided list of bug detector names.
 *
 * @param bugDetectors - An array of strings representing the names of bug detectors to be registered.
 * @param saveFirstBugDetectorException - A callback function that takes an Error object and a number (trimErrorStackLines)
 *                                        as parameters. It is called when a bug is detected to handle the exception.
 * @returns A Promise that resolves to void when all bug detectors have been registered.
 *
 * @example
 * registerBugDetectors(["commandInjection"], (e, n) => console.log(e.message))
 * .then(() => console.log("All bug detectors registered."));
 */
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

/**
 * Replaces a built-in function with a custom implementation while preserving
 * the original function for potential use within the replacement function.
 *
 * @template F - The type of the replacement function. Must extend Function.
 * @template K - The type of the original function being replaced. Must extend Function.
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

// TODO: Internally Jazzer.js should use original unhooked builtin functions.
export type OriginalFnInfo = [string, string, (...args: unknown[]) => unknown];

/**
 * Registers a generic bug detector by hooking target functions and checking
 * for the presence of a specified evil command.
 *
 * @template F - Type of the original function being hooked.
 * @param {string} evilCommand - The command used to identify the specific bug.
 * @param {string} errorString - The prefix string for the error message when the bug is detected.
 * @param {(e: Error, trimErrorStackLines: number) => void} saveFirstBugDetectorException - Callback function that saves the first bug detector exception.
 * @param {boolean} callOriginalFn - If true, calls the original function after checking for the bug.
 * @param {{ moduleName: string; functionName: string }[]} targetFunctions - Array of objects specifying the module and function names to hook for this bug detector.
 * @returns {Promise<OriginalFnInfo[]>} - A promise that resolves to an array of original function info.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export async function registerBugDetector<F extends Function>(
	evilCommand: string,
	errorString: string,
	saveFirstBugDetectorException: (
		e: Error,
		trimErrorStackLines: number
	) => void,
	callOriginalFn: boolean,
	targetFunctions: { moduleName: string; functionName: string }[]
): Promise<OriginalFnInfo[]> {
	// eslint-disable-next-line @typescript-eslint/ban-types
	async function registerBugDetectorInternal(
		moduleName: string,
		targetFnName: string,
		callOriginalFn: boolean
	): Promise<OriginalFnInfo> {
		const id = nextFakePC();

		return [
			moduleName,
			targetFnName,
			await hookBuiltInFunction(
				moduleName,
				targetFnName,
				(
					originalFn: F,
					cmdOrFileOrPath: string,
					...args: unknown[]
				): F | void => {
					guideTowardsEquality(cmdOrFileOrPath, evilCommand, id);
					if (cmdOrFileOrPath.includes(evilCommand)) {
						const err = new Error(
							errorString +
								targetFnName +
								"() called with command: '" +
								cmdOrFileOrPath +
								"'"
						);

						// Remove the first 3 lines after the message from the stack trace.
						// The first lines are internal Jazzer function calls.
						saveFirstBugDetectorException(err, 3);
					}
					if (callOriginalFn) {
						return originalFn(cmdOrFileOrPath, ...args);
					}
				}
			),
		];
	}

	const functionInfo: OriginalFnInfo[] = [];
	for (const targetFunction of targetFunctions) {
		functionInfo.push(
			await registerBugDetectorInternal(
				targetFunction.moduleName,
				targetFunction.functionName,
				callOriginalFn
			)
		);
	}

	return functionInfo;
}
