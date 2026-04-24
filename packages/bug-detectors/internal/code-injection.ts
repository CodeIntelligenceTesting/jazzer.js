/*
 * Copyright 2026 Code Intelligence GmbH
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

import type { Context } from "vm";

import {
	getJazzerJsGlobal,
	guideTowardsContainment,
	registerAfterEachCallback,
	reportAndThrowFinding,
	reportFinding,
} from "@jazzer.js/core";
import { registerBeforeHook } from "@jazzer.js/hooking";

import { ensureCanary } from "../shared/code-injection-canary";

type PendingAccess = {
	canaryName: string;
	invoked: boolean;
};

const canaryCache = new WeakMap<object, string>();

// Canary access findings are delayed until the fuzz input finishes so a later
// canary invocation can supersede the heuristic access report.
const pendingAccesses: PendingAccess[] = [];

ensureActiveCanary();
registerAfterEachCallback(flushPendingAccesses);

registerBeforeHook(
	"eval",
	"",
	false,
	function beforeEvalHook(
		_thisPtr: unknown,
		params: unknown[],
		hookId: number,
	) {
		const canaryName = ensureActiveCanary();

		const code = params[0];
		if (typeof code === "string") {
			guideTowardsContainment(code, canaryName, hookId);
		}
	},
);

registerBeforeHook(
	"Function",
	"",
	false,
	function beforeFunctionHook(
		_thisPtr: unknown,
		params: unknown[],
		hookId: number,
	) {
		const canaryName = ensureActiveCanary();
		if (params.length === 0) return;

		const functionBody = params[params.length - 1];
		if (functionBody == null) return;

		let functionBodySource: string;
		if (typeof functionBody === "string") {
			functionBodySource = functionBody;
		} else {
			try {
				functionBodySource = String(functionBody);
			} catch {
				return;
			}
			// Function bodies are string-coercible. Coerce non-strings here so the
			// fuzzer can still learn object-provided code, then pass the coerced value
			// through to avoid invoking user toString methods a second time.
			params[params.length - 1] = functionBodySource;
		}
		guideTowardsContainment(functionBodySource, canaryName, hookId);
	},
);

function getVmContext(): Context | undefined {
	return getJazzerJsGlobal<Context>("vmContext");
}

function ensureActiveCanary(): string {
	return ensureCanary(
		[
			// Order matters: in Jest, eval/Function run inside Jest's VM context,
			// so generated code can only see a canary installed in that context.
			// CLI fuzzing has no VM context, so globalThis is the fallback.
			{ label: "vmContext", object: getVmContext() },
			{ label: "globalThis", object: globalThis },
		],
		canaryCache,
		createCanaryDescriptor,
	);
}

function createCanaryDescriptor(canaryName: string): PropertyDescriptor {
	return {
		get() {
			const pendingAccess = { canaryName, invoked: false };
			pendingAccesses.push(pendingAccess);

			return function canaryCall() {
				pendingAccess.invoked = true;
				reportAndThrowFinding(
					buildFindingMessage(
						"Confirmed Code Injection (Canary Invoked)",
						`invoked canary: ${canaryName}`,
					),
					false,
				);
			};
		},
		enumerable: false,
		configurable: false,
	};
}

function flushPendingAccesses(): void {
	for (const pendingAccess of pendingAccesses.splice(0)) {
		if (pendingAccess.invoked) {
			continue;
		}
		reportFinding(
			buildFindingMessage(
				"Potential Code Injection (Canary Accessed)",
				`accessed canary: ${pendingAccess.canaryName}`,
			),
			false,
		);
	}
}

function buildFindingMessage(title: string, action: string): string {
	return `${title} -- ${action}`;
}
