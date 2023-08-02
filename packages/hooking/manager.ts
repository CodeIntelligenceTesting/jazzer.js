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

import { builtinModules } from "module";

import {
	AfterHookFn,
	BeforeHookFn,
	Hook,
	HookFn,
	HookType,
	ReplaceHookFn,
} from "./hook";
import { hookTracker, logHooks } from "./tracker";

export class MatchingHooksResult {
	private _beforeHooks: Hook[] = [];
	private _replaceHooks: Hook[] = [];
	private _afterHooks: Hook[] = [];

	get hooks() {
		return this._beforeHooks.concat(this._afterHooks, this._replaceHooks);
	}

	hasHooks() {
		return (
			this.hasBeforeHooks() || this.hasReplaceHooks() || this.hasAfterHooks()
		);
	}

	get beforeHooks(): Hook[] {
		return this._beforeHooks;
	}

	hasBeforeHooks() {
		return this._beforeHooks.length !== 0;
	}

	get replaceHooks(): Hook[] {
		return this._replaceHooks;
	}

	hasReplaceHooks() {
		return this._replaceHooks.length !== 0;
	}

	get afterHooks(): Hook[] {
		return this._afterHooks;
	}

	hasAfterHooks() {
		return this._afterHooks.length !== 0;
	}

	addHook(h: Hook) {
		switch (h.type) {
			case HookType.Before:
				this._beforeHooks.push(h);
				break;
			case HookType.Replace:
				this._replaceHooks.push(h);
				break;
			case HookType.After:
				this._afterHooks.push(h);
				break;
		}
	}

	verify() {
		if (this._replaceHooks.length > 1) {
			throw new Error(
				`For a given target function, one REPLACE hook can be configured. Found: ${this._replaceHooks.length}`,
			);
		}

		if (
			this.hasReplaceHooks() &&
			(this.hasBeforeHooks() || this.hasAfterHooks())
		) {
			throw new Error(
				`For a given target function, REPLACE hooks cannot be mixed up with BEFORE/AFTER hooks. Found ${
					this._replaceHooks.length
				} REPLACE hooks and ${
					this._beforeHooks.length + this._afterHooks.length
				} BEFORE/AFTER hooks`,
			);
		}

		if (this.hasAfterHooks()) {
			if (
				!this._afterHooks.every((h) => h.async) &&
				!this._afterHooks.every((h) => !h.async)
			) {
				throw new Error(
					"For a given target function, AFTER hooks have to be either all sync or all async.",
				);
			}
		}
	}
}

export class HookManager {
	private _hooks: Hook[] = [];

	/**
	 * Finalizes the registration of new hooks and performs necessary
	 * initialization steps for the hooks to work. This method must be called
	 * after all hooks have been registered.
	 */
	async finalizeHooks() {
		// Built-in functions cannot be hooked by the instrumentor, so that is
		// explicitly done here instead.
		// Loading build-in modules is asynchronous, so we need to wait, which
		// is not possible in the instrumentor.
		for (const builtinModule of builtinModules) {
			const matchedHooks = this._hooks.filter((hook) =>
				builtinModule.includes(hook.pkg),
			);
			for (const hook of matchedHooks) {
				try {
					await hookBuiltInFunction(hook);
				} catch (e) {
					if (process.env.JAZZER_DEBUG) {
						console.error(
							"DEBUG: [hooking] Could not hook built-in function: " +
								hook.pkg +
								" : " +
								hook.target,
						);
						console.error(e);
					}
				}
			}
		}
	}

	registerHook(
		hookType: HookType,
		target: string,
		pkg: string,
		async: boolean,
		hookFn: HookFn,
	): Hook {
		const hook = new Hook(hookType, target, pkg, async, hookFn);
		this._hooks.push(hook);
		return hook;
	}

	get hooks() {
		return this._hooks;
	}

	clearHooks() {
		this._hooks = [];
	}

	hookIndex(hook: Hook): number {
		return this._hooks.indexOf(hook);
	}

	matchingHooks(target: string, filepath: string): MatchingHooksResult {
		const matches = this._hooks
			.filter((hook: Hook) => hook.match(filepath, target))
			.reduce(
				(matches: MatchingHooksResult, hook: Hook) => {
					matches.addHook(hook);
					return matches;
				},

				new MatchingHooksResult(),
			);

		matches.verify();
		return matches;
	}

	hasFunctionsToHook(filepath: string): boolean {
		return (
			this._hooks.find((hook) => filepath.includes(hook.pkg)) !== undefined
		);
	}

	callHook(
		id: number,
		thisPtr: object,
		params: unknown[],
		resultOrOriginalFunction: unknown,
	): unknown {
		const hook = this._hooks[id];
		switch (hook.type) {
			case HookType.Before:
				(hook.hookFunction as BeforeHookFn)(thisPtr, params, callSiteId());
				break;
			case HookType.Replace:
				return (hook.hookFunction as ReplaceHookFn)(
					thisPtr,
					params,
					callSiteId(),
					// eslint-disable-next-line @typescript-eslint/ban-types
					resultOrOriginalFunction as Function,
				);
			case HookType.After:
				(hook.hookFunction as AfterHookFn)(
					thisPtr,
					params,
					callSiteId(),
					resultOrOriginalFunction,
				);
		}
	}
}

export const hookManager = new HookManager();

export function registerBeforeHook(
	target: string,
	pkg: string,
	async: boolean,
	hookFn: HookFn,
) {
	hookManager.registerHook(HookType.Before, target, pkg, async, hookFn);
}

export function registerReplaceHook(
	target: string,
	pkg: string,
	async: boolean,
	hookFn: HookFn,
) {
	hookManager.registerHook(HookType.Replace, target, pkg, async, hookFn);
}

export function registerAfterHook(
	target: string,
	pkg: string,
	async: boolean,
	hookFn: HookFn,
) {
	hookManager.registerHook(HookType.After, target, pkg, async, hookFn);
}

export function getFunction(
	module: object,
	propertyAccessors: string[],
): unknown {
	let current = module;

	for (const propertyAccessor of propertyAccessors) {
		try {
			// @ts-ignore
			current = current[propertyAccessor];
		} catch (e) {
			return undefined;
		}
	}
	return current;
}

export function setFunction(
	module: object,
	propertyAccessors: string[],
	newFunction: unknown,
): void {
	if (!(newFunction instanceof Function || typeof newFunction === "function")) {
		if (process.env.JAZZER_DEBUG) {
			console.error(
				"DEBUG: [hooking] Could not hook built-in function: " +
					propertyAccessors.join(".") +
					"\n" +
					"   provided newFunction is not a function",
			);
		}
		return;
	}

	let current = module;
	for (const propertyAccessor of propertyAccessors.slice(0, -1)) {
		try {
			// @ts-ignore
			current = current[propertyAccessor];
		} catch (e) {
			if (process.env.JAZZER_DEBUG) {
				console.error(
					"DEBUG: [hooking] Could not hook built-in function: " +
						propertyAccessors.join("."),
				);
			}
			return;
		}
	}
	// @ts-ignore
	current[propertyAccessors[propertyAccessors.length - 1]] = newFunction;
}

/**
 * Replaces a built-in function with a custom implementation while preserving
 * the original function for potential use within the replacement function.
 */
export async function hookBuiltInFunction(hook: Hook): Promise<void> {
	if (hook.registered) return;
	hook.registered = true;
	const { default: module } = await import(hook.pkg);

	const targetPropertyAccessors = hook.target.split(".");
	const originalFn = getFunction(module, targetPropertyAccessors);

	if (!(originalFn instanceof Function || typeof originalFn === "function")) {
		if (process.env.JAZZER_DEBUG) {
			console.error(
				"DEBUG: [hooking] Could not hook built-in function: " +
					hook.pkg +
					" : " +
					hook.target,
			);
		}
		return;
	}
	const id = callSiteId(hookManager.hookIndex(hook), hook.pkg, hook.target);
	if (hook.type == HookType.Before) {
		setFunction(module, targetPropertyAccessors, function (...args: unknown[]) {
			// @ts-ignore
			(hook.hookFunction as BeforeHookFn)(this, args, id);
			// @ts-ignore
			return originalFn.apply(this, args);
		});
	} else if (hook.type == HookType.Replace) {
		setFunction(module, targetPropertyAccessors, function (...args: unknown[]) {
			// @ts-ignore
			return (hook.hookFunction as ReplaceHookFn)(this, args, id, originalFn);
		});
	} else if (hook.type == HookType.After) {
		setFunction(module, targetPropertyAccessors, function (...args: unknown[]) {
			// @ts-ignore
			const result: unknown = originalFn.apply(this, args);
			// @ts-ignore
			return (hook.hookFunction as AfterHookFn)(this, args, id, result);
		});
	} else {
		throw new Error(`Unknown hook type ${hook.type}`);
	}
	logHooks([hook]);
	hookTracker.addApplied(hook.pkg, hook.target);
}

/**
 * Returns a unique id for the call site of the function that called this function.
 * @param additionalArguments additional arguments to be included in the hash
 */
export function callSiteId(...additionalArguments: unknown[]): number {
	const stackTrace = additionalArguments?.join(",") + new Error().stack;
	if (!stackTrace || stackTrace.length === 0) {
		return 0;
	}
	let hash = 0,
		i,
		chr;
	for (i = 0; i < stackTrace.length; i++) {
		chr = stackTrace.charCodeAt(i);
		hash = (hash << 5) - hash + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
}
