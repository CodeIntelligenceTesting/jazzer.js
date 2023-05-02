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

import { OriginalFnInfo, registerBugDetector } from "./index";

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

/*
 * This function registers the actual command injection bug detector
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export async function registerCommandInjectionBugDetector<F extends Function>(
	saveFirstBugDetectorException: (
		e: Error,
		trimErrorStackLines: number
	) => void,
	callOriginalFn: boolean
): Promise<OriginalFnInfo[]> {
	return await registerBugDetector<F>(
		commandInjectionEvilCommand,
		"Command Injection: ",
		saveFirstBugDetectorException,
		callOriginalFn,
		commandInjectionFnsToHook
	);
}
