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
 *
 * Examples showcasing the custom hooks API
 */

/* eslint-disable @typescript-eslint/no-var-requires,@typescript-eslint/no-unused-vars */

const { registerReplaceHook } = require("@jazzer.js/hooking");
const { reportFinding } = require("@jazzer.js/bug-detectors");
const { guideTowardsEquality } = require("@jazzer.js/fuzzer");

/**
 * Custom bug detector for command injection.
 */
registerReplaceHook(
	"execSync",
	"child_process",
	false,
	(thisPtr, params, hookId, origFn) => {
		if (params === undefined || params.length === 0) {
			return;
		}
		const command = params[0];
		if (command.includes("jaz_zer")) {
			reportFinding(
				`Command Injection in spawnSync(): called with '${command}'`
			);
		}
		guideTowardsEquality(command, "jaz_zer", hookId);
	}
);