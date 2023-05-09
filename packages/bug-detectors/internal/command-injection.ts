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

import { reportFinding } from "../findings";
import { guideTowardsContainment } from "@jazzer.js/fuzzer";
import { registerBeforeHook } from "@jazzer.js/hooking";

/**
 * Importing this file adds "before-hooks" for all functions in the built-in `child_process` module and guides
 * the fuzzer towards the uniquely chosen `goal` string `"jaz_zer"`. If the goal is found in the first argument
 * of any hooked function, a `Finding` is reported.
 */
const goal = "jaz_zer";
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

for (const functionName of functionNames) {
	const beforeHook = (thisPtr: unknown, params: unknown[], hookId: number) => {
		if (params === undefined || params.length === 0) {
			return;
		}
		// The first argument of the original function is:
		// - the command to execute in exec/execSync, and spawn/spawnSync
		// - the command/file path to execute in execFile/execFileSync
		// - the module path to fork in fork
		const firstArgument = params[0] as string;
		if (firstArgument.includes(goal)) {
			reportFinding(
				`Command Injection in ${functionName}(): called with '${firstArgument}'`
			);
		}
		guideTowardsContainment(firstArgument, goal, hookId);
	};

	registerBeforeHook(functionName, moduleName, false, beforeHook);
}
