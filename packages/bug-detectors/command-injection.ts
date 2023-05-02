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

import {
	BugDetectorError,
	hookBuiltInFunction,
	OriginalFnInfo,
	saveFirstBugDetectorError,
} from "./index";
import { nextFakePC } from "@jazzer.js/instrumentor/dist/plugins/helpers";
import { guideTowardsEquality } from "@jazzer.js/fuzzer";

export const commandInjectionEvilCommand =
	process.platform === "win32" ? "copy NUL EVIL" : "touch EVIL";

export const commandInjectionFnsToHook = [
	{ moduleName: "child_process", functionName: "exec" },
	{ moduleName: "child_process", functionName: "execSync" },
	{ moduleName: "child_process", functionName: "execFile" },
	{ moduleName: "child_process", functionName: "execFileSync" },
	{ moduleName: "child_process", functionName: "spawn" },
	{ moduleName: "child_process", functionName: "spawnSync" },
	{ moduleName: "child_process", functionName: "fork" },
];

// eslint-disable-next-line @typescript-eslint/ban-types
export async function registerCommandInjectionBugDetector<F extends Function>(
	callOriginalFn: boolean
): Promise<OriginalFnInfo[]> {
	return await registerBugDetector<F>(
		commandInjectionEvilCommand,
		"Command Injection: ",
		callOriginalFn,
		commandInjectionFnsToHook
	);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export async function registerBugDetector<F extends Function>(
	evilCommand: string,
	errorString: string,
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
						const err = new BugDetectorError(
							errorString +
								targetFnName +
								"() called with command: '" +
								cmdOrFileOrPath +
								"'"
						);

						// Remove the first 3 lines after the message from the stack trace.
						// The first lines are internal Jazzer function calls.
						saveFirstBugDetectorError(err, 3);
						throw err;
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
