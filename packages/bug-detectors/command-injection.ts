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
	saveFirstBugDetectorError,
} from "./index";
import { nextFakePC } from "@jazzer.js/instrumentor/dist/plugins/helpers";
import { guideTowardsEquality } from "@jazzer.js/fuzzer";

// eslint-disable-next-line @typescript-eslint/ban-types
export async function registerCommandInjectionBugDetectors<F extends Function>(
	callOriginalFn: boolean
): Promise<void> {
	async function registerBugDetector(
		moduleName: string,
		targetFunctionName: string,
		evilCommand: string,
		baseErrorString: string,
		callOriginalFn: boolean
	): Promise<F> {
		const id = nextFakePC();
		return await hookBuiltInFunction(
			moduleName,
			targetFunctionName,
			(
				originalFn: F,
				cmdOrFileOrPath: string,
				...args: unknown[]
			): F | void => {
				guideTowardsEquality(cmdOrFileOrPath, evilCommand, id);
				if (cmdOrFileOrPath.includes(evilCommand)) {
					const err = new BugDetectorError(
						baseErrorString +
							targetFunctionName +
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
		);
	}
	const evilCommand =
		process.platform === "win32" ? "copy NUL EVIL" : "touch EVIL";
	const baseErrorString = "Command Injection: ";
	const moduleName = "child_process";
	const functionNames = [
		"exec",
		"execSync",
		"execFile",
		"execFileSync",
		"spawn",
		"spawnSync",
		"fork",
	];

	for (const targetFunction of functionNames) {
		await registerBugDetector(
			moduleName,
			targetFunction,
			evilCommand,
			baseErrorString,
			callOriginalFn
		);
	}
}
