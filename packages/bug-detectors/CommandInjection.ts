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

// Bug detector for the built-in "child_process" library.

import { nextFakePC } from "@jazzer.js/instrumentor/dist/plugins/helpers";
import { guideTowardsEquality } from "@jazzer.js/fuzzer";
import { OriginalFnInfo, hookBuiltInFunction } from "./index";

export const commandInjectionEvilCommand =
	process.platform === "win32" ? "copy NUL EVIL" : "touch EVIL";

// eslint-disable-next-line @typescript-eslint/ban-types
export async function registerCommandInjectionBugDetector<F extends Function>(
	saveFirstBugDetectorException: (
		e: Error,
		trimErrorStackLines: number
	) => void,
	callOriginalFn: boolean
): Promise<OriginalFnInfo[]> {
	// eslint-disable-next-line @typescript-eslint/ban-types
	async function registerExecBugDetectorInternal(
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
					guideTowardsEquality(
						cmdOrFileOrPath,
						commandInjectionEvilCommand,
						id
					);
					if (cmdOrFileOrPath.includes(commandInjectionEvilCommand)) {
						const err = new Error(
							"Command Injection : " +
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
	functionInfo.push(
		await registerExecBugDetectorInternal(
			"child_process",
			"exec",
			callOriginalFn
		)
	);
	functionInfo.push(
		await registerExecBugDetectorInternal(
			"child_process",
			"execFile",
			callOriginalFn
		)
	);
	functionInfo.push(
		await registerExecBugDetectorInternal(
			"child_process",
			"spawn",
			callOriginalFn
		)
	);
	functionInfo.push(
		await registerExecBugDetectorInternal(
			"child_process",
			"fork",
			callOriginalFn
		)
	);
	// Synchronous methods
	functionInfo.push(
		await registerExecBugDetectorInternal(
			"child_process",
			"execFileSync",
			callOriginalFn
		)
	);
	functionInfo.push(
		await registerExecBugDetectorInternal(
			"child_process",
			"execSync",
			callOriginalFn
		)
	);
	functionInfo.push(
		await registerExecBugDetectorInternal(
			"child_process",
			"spawnSync",
			callOriginalFn
		)
	);
	return functionInfo;
}
