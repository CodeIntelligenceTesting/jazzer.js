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

const { registerReplaceHook } = require("@jazzer.js/hooking");
const { guideTowardsEquality, reportFinding } = require("@jazzer.js/core");

/**
 * Custom bug detector for command injection. This hook does not call the original function (execSync) for two reasons:
 * 1. To speed up fuzzing---calling execSync gives us about 5 executions per second, while calling nothing gives us a lot more.
 * 2. To prevent the fuzzer from accidentally calling commands like "rm -rf" on the host system during local tests.
 */
registerReplaceHook(
	"execSync",
	"child_process",
	false,
	(thisPtr, params, hookId) => {
		if (params === undefined || params.length === 0) {
			return;
		}
		const command = params[0];
		if (command.includes("jaz_zer")) {
			reportFinding(
				`Command Injection in spawnSync(): called with '${command}'`,
			);
		}
		guideTowardsEquality(command, "jaz_zer", hookId);
	},
);
