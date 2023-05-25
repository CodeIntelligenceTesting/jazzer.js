/*
 * Copyright 2022 Code Intelligence GmbH
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
	AfterHookFn,
	BeforeHookFn,
	Hook,
	HookFn,
	HookType,
	ReplaceHookFn,
	logHooks,
	hookTracker,
} from "./hook";
import { PluginTarget } from "@babel/core";

export class MatchingHooksResult {
	public beforeHooks: Hook[] = [];
	public replaceHooks: Hook[] = [];
	public afterHooks: Hook[] = [];

	addHook(h: Hook) {
		switch (h.type) {
			case HookType.Before:
				this.beforeHooks.push(h);
				break;
			case HookType.Replace:
				this.replaceHooks.push(h);
				break;
			case HookType.After:
				this.afterHooks.push(h);
				break;
		}
	}

	verify() {
		if (this.replaceHooks.length > 1) {
			throw new Error(
				`For a given target function, one REPLACE hook can be configured. Found: ${this.replaceHooks.length}`,
			);
		}

		if (
			this.hasReplaceHooks() &&
			(this.hasBeforeHooks() || this.hasAfterHooks())
		) {
			throw new Error(
				`For a given target function, REPLACE hooks cannot be mixed up with BEFORE/AFTER hooks. Found ${
					this.replaceHooks.length
				} REPLACE hooks and ${
					this.beforeHooks.length + this.afterHooks.length
				} BEFORE/AFTER hooks`,
			);
		}

		if (this.hasAfterHooks()) {
			if (
				!this.afterHooks.every((h) => h.async) &&
				!this.afterHooks.every((h) => !h.async)
			) {
				throw new Error(
					"For a given target function, AFTER hooks have to be either all sync or all async.",
				);
			}
		}
	}

	hooks() {
		return this.beforeHooks.concat(this.afterHooks, this.replaceHooks);
	}

	hasHooks() {
		return (
			this.hasBeforeHooks() || this.hasReplaceHooks() || this.hasAfterHooks()
		);
	}

	hasBeforeHooks() {
		return this.beforeHooks.length !== 0;
	}

	hasReplaceHooks() {
		return this.replaceHooks.length !== 0;
	}

	hasAfterHooks() {
		return this.afterHooks.length !== 0;
	}
}

export class HookManager {
	private _hooks: Hook[] = [];
	private afterEachCallbacks: Array<Thunk> = [];
	private beforeEachCallbacks: Array<Thunk> = [];
	private dictionaries: Array<string> = [];
	private instrumentationPlugins: Array<() => PluginTarget> = [];

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

	getMatchingHooks(filepath: string): Hook[] {
		return this._hooks.filter((hook) => filepath.includes(hook.pkg));
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

	registerAfterEachCallback(callback: Thunk) {
		this.afterEachCallbacks.push(callback);
	}

	registerBeforeEachCallback(callback: Thunk) {
		this.beforeEachCallbacks.push(callback);
	}

	addDictionary(libFuzzerDictionary: string[]) {
		this.dictionaries.push(this.compileFuzzerDictionary(libFuzzerDictionary));
	}

	registerInstrumentationPlugin(plugin: () => PluginTarget) {
		this.instrumentationPlugins.push(plugin);
	}

	getDictionaries() {
		return this.dictionaries;
	}

	getInstrumentationPlugins() {
		return this.instrumentationPlugins;
	}

	runAfterEachCallbacks() {
		for (const afterEachCallback of this.afterEachCallbacks) {
			afterEachCallback();
		}
	}

	runBeforeEachCallbacks() {
		for (const beforeEachCallback of this.beforeEachCallbacks) {
			beforeEachCallback();
		}
	}

	private compileFuzzerDictionary(lines: string[]): string {
		return lines.join("\n");
	}
}

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

type Thunk = () => void;

export const hookManager = new HookManager();
// convenience functions to register hooks
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

export function registerAfterEachCallback(callback: Thunk) {
	hookManager.registerAfterEachCallback(callback);
}

export function registerBeforeEachCallback(callback: Thunk) {
	hookManager.registerBeforeEachCallback(callback);
}

export function addDictionary(...libFuzzerDictionary: string[]) {
	hookManager.addDictionary(libFuzzerDictionary);
}

export function registerInstrumentationPlugin(plugin: () => PluginTarget) {
	hookManager.registerInstrumentationPlugin(plugin);
}

/**
 * Replaces a built-in function with a custom implementation while preserving
 * the original function for potential use within the replacement function.
 */
export async function hookBuiltInFunction(hook: Hook): Promise<void> {
	const { default: module } = await import(hook.pkg);
	const originalFn = module[hook.target];
	const id = callSiteId(hookManager.hookIndex(hook), hook.pkg, hook.target);
	if (hook.type == HookType.Before) {
		module[hook.target] = (...args: unknown[]) => {
			(hook.hookFunction as BeforeHookFn)(null, args, id);
			return originalFn(...args);
		};
	} else if (hook.type == HookType.Replace) {
		module[hook.target] = (...args: unknown[]) => {
			return (hook.hookFunction as ReplaceHookFn)(null, args, id, originalFn);
		};
	} else if (hook.type == HookType.After) {
		module[hook.target] = (...args: unknown[]) => {
			const result: unknown = originalFn(...args);
			return (hook.hookFunction as AfterHookFn)(null, args, id, result);
		};
	} else {
		throw new Error(`Unknown hook type ${hook.type}`);
	}
	logHooks([hook]);
	hookTracker.addApplied(hook.pkg, hook.target);
}

// Keep track of statements and expressions that should not be instrumented.
// This is necessary to avoid infinite recursion when instrumenting code.
class InstrumentationGuard {
	private map: Map<string, Set<string>> = new Map();

	/**
	 * Add a tag and a value to the guard. This can be used to look up if the value.
	 * The value will be stringified internally before being added to the guard.
	 * @example instrumentationGuard.add("AssignmentExpression", node.left);
	 */
	add(tag: string, value: unknown) {
		if (!this.map.has(tag)) {
			this.map.set(tag, new Set());
		}
		this.map.get(tag)?.add(JSON.stringify(value));
	}

	/**
	 * Check if a value with a given tag exists in the guard. The value will be stringified internally before being checked.
	 * @example instrumentationGuard.has("AssignmentExpression", node.object);
	 */
	has(expression: string, value: unknown): boolean {
		return (
			(this.map.has(expression) &&
				this.map.get(expression)?.has(JSON.stringify(value))) ??
			false
		);
	}
}

export const instrumentationGuard = new InstrumentationGuard();
