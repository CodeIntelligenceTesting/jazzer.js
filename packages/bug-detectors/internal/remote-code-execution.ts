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
	guideTowardsContainment,
	reportAndThrowFinding,
} from "@jazzer.js/core";
import { callSiteId, registerBeforeHook } from "@jazzer.js/hooking";

const targetString = "jaz_zer";

registerBeforeHook(
	"eval",
	"",
	false,
	function beforeEvalHook(_thisPtr: unknown, params: string[], hookId: number) {
		const code = params[0];
		// This check will prevent runtime TypeErrors should the user decide to call Function with
		// non-string arguments.
		// noinspection SuspiciousTypeOfGuard
		if (typeof code === "string" && code.includes(targetString)) {
			reportAndThrowFinding(
				`Remote Code Execution using eval:\n        '${code}'`,
			);
		}

		// Since we do not hook eval using the hooking framework, we have to recompute the
		// call site ID on every call to eval. This shouldn't be an issue, because eval is
		// considered evil and should not be called too often, or even better -- not at all!
		guideTowardsContainment(code, targetString, hookId);
	},
);

registerBeforeHook(
	"Function",
	"",
	false,
	function beforeFunctionHook(
		_thisPtr: unknown,
		params: string[],
		hookId: number,
	) {
		if (params.length > 0) {
			const functionBody = params[params.length - 1];

			// noinspection SuspiciousTypeOfGuard
			if (typeof functionBody === "string") {
				if (functionBody.includes(targetString)) {
					reportAndThrowFinding(
						`Remote Code Execution using Function:\n        '${functionBody}'`,
					);
				}
				guideTowardsContainment(functionBody, targetString, hookId);
			}
		}
	},
);
