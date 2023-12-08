/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const {
	guideTowardsEquality,
	reportAndThrowFinding,
} = require("@jazzer.js/core");
const { registerReplaceHook } = require("@jazzer.js/hooking");

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
			reportAndThrowFinding(
				`Command Injection in spawnSync(): called with '${command}'`,
			);
		}
		guideTowardsEquality(command, "jaz_zer", hookId);
	},
);
