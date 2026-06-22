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

import { bugDetectorConfigurations } from "../configuration";
import { ensureCanary } from "../shared/code-injection-canary";
import {
	buildGenericSuppressionSnippet,
	captureStack,
	getUserFacingStackLines,
	IgnoreList,
	type IgnoreRule,
} from "../shared/finding-suppression";

export type { IgnoreRule } from "../shared/finding-suppression";

type PendingAccess = {
	canaryName: string;
	stack: string;
	invoked: boolean;
};

/**
 * Configuration for the Code Injection bug detector.
 * Controls the reporting and suppression of dynamic code evaluation findings.
 */
export interface CodeInjectionConfig {
	/**
	 * Disables Stage 1 (Access) reporting entirely.
	 * The detector will no longer report when the canary is merely read.
	 */
	disableAccessReporting(): this;
	/**
	 * Disables Stage 2 (Invocation) reporting entirely.
	 * The detector will no longer report when the canary is actually executed.
	 */
	disableInvocationReporting(): this;
	/**
	 * Suppresses Stage 1 (Access) findings that match the provided rule.
	 * Use this to silence safe heuristic reads such as template lookups.
	 */
	ignoreAccess(rule: IgnoreRule): this;
	/**
	 * Suppresses Stage 2 (Invocation) findings that match the provided rule.
	 * Use this only for known-safe execution sinks in test environments.
	 */
	ignoreInvocation(rule: IgnoreRule): this;
}

class CodeInjectionConfigImpl implements CodeInjectionConfig {
	private _reportAccess = true;
	private _reportInvocation = true;
	private readonly _ignoredAccessRules = new IgnoreList();
	private readonly _ignoredInvocationRules = new IgnoreList();

	disableAccessReporting(): this {
		this._reportAccess = false;
		return this;
	}

	disableInvocationReporting(): this {
		this._reportInvocation = false;
		return this;
	}

	ignoreAccess(rule: IgnoreRule): this {
		this._ignoredAccessRules.add(rule);
		return this;
	}

	ignoreInvocation(rule: IgnoreRule): this {
		this._ignoredInvocationRules.add(rule);
		return this;
	}

	shouldReportAccess(stack: string): boolean {
		return this._reportAccess && !this._ignoredAccessRules.matches(stack);
	}

	shouldReportInvocation(stack: string): boolean {
		return (
			this._reportInvocation && !this._ignoredInvocationRules.matches(stack)
		);
	}
}

const config = new CodeInjectionConfigImpl();
bugDetectorConfigurations.set("code-injection", config);

// The canary name is target-specific: Jest VM contexts and globalThis can have
// different existing properties. Weak keys avoid retaining old VM contexts.
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
			const accessStack = captureStack();
			const pendingAccess = config.shouldReportAccess(accessStack)
				? {
						canaryName,
						stack: accessStack,
						invoked: false,
					}
				: undefined;
			if (pendingAccess) {
				pendingAccesses.push(pendingAccess);
			}

			return function canaryCall() {
				const invocationStack = captureStack();
				if (config.shouldReportInvocation(invocationStack)) {
					if (pendingAccess) {
						pendingAccess.invoked = true;
					}
					reportAndThrowFinding(
						buildFindingMessage(
							"Confirmed Code Injection (Canary Invoked)",
							`invoked canary: ${canaryName}`,
							invocationStack,
							"ignoreInvocation",
							"If this execution sink is expected in your test environment, suppress it:",
						),
						false,
					);
				}
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
				pendingAccess.stack,
				"ignoreAccess",
				"If this is a safe heuristic read, suppress it to continue fuzzing for code execution. Add this to your custom hooks:",
			),
			false,
		);
	}
}

function buildFindingMessage(
	title: string,
	action: string,
	stack: string,
	suppressionMethod: "ignoreAccess" | "ignoreInvocation",
	hint: string,
): string {
	const relevantStackLines = getUserFacingStackLines(stack);
	const message = [`${title} -- ${action}`];
	if (relevantStackLines.length > 0) {
		message.push(...relevantStackLines);
	}
	message.push(
		"",
		`[!] ${hint}`,
		"    Example only: copy/paste it and adapt `stackPattern` to your needs.",
		"",
		buildGenericSuppressionSnippet("code-injection", suppressionMethod),
	);
	return message.join("\n");
}
