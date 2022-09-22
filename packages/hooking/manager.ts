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
	Hook,
	HookType,
	HookFn,
	BeforeHookFn,
	ReplaceHookFn,
	AfterHookFn,
} from "./hook";

export type MatchingHooksResult = { [key in HookType]: Hook[] };

export class HookManager {
	private hooks: Hook[] = [];

	registerHook(
		hookType: HookType,
		target: string,
		pkg: string,
		async: boolean,
		hookFn: HookFn
	) {
		const h = new Hook(hookType, target, pkg, [], async, hookFn);
		this.hooks.push(h);
	}

	clearHooks() {
		this.hooks = [];
	}

	hookIndex(hook: Hook): number {
		return this.hooks.indexOf(hook);
	}

	matchingHooks(target: string, filepath: string): MatchingHooksResult {
		const matches = this.hooks
			.filter((h: Hook) => h.match(filepath, target))
			.reduce(
				(res: MatchingHooksResult, hook: Hook) => {
					res[hook.type].push(hook);
					return res;
				},
				{
					[HookType.Before]: [],
					[HookType.Replace]: [],
					[HookType.After]: [],
				}
			);

		if (
			matches[HookType.Replace].length === 0 ||
			(matches[HookType.Replace].length === 1 &&
				matches[HookType.Before].length === 0 &&
				matches[HookType.After].length === 0)
		) {
			return matches;
		} else {
			throw new Error(
				`For a given function, you can either have a single REPLACE hook or BEFORE/AFTER hooks. Found ${
					matches[HookType.Replace].length
				} REPLACE hooks and ${
					matches[HookType.Before].length + matches[HookType.After].length
				} BEFORE/AFTER hooks`
			);
		}
	}

	hasFunctionsToHook(filepath: string): boolean {
		return this.hooks.find((hook) => filepath.includes(hook.pkg)) !== undefined;
	}

	callHook(
		id: number,
		thisPtr: object,
		params: any[],
		result: any,
		// eslint-disable-next-line @typescript-eslint/ban-types
		origFunc: Function
	): any {
		const hook = this.hooks[id];
		switch (hook.type) {
			case HookType.Before:
				(hook.hookFunction as BeforeHookFn)(thisPtr, params, this.callSiteId());
				break;
			case HookType.Replace:
				(hook.hookFunction as ReplaceHookFn)(
					origFunc,
					thisPtr,
					params,
					this.callSiteId()
				);
				break;
			case HookType.After:
				(hook.hookFunction as AfterHookFn)(
					thisPtr,
					params,
					this.callSiteId(),
					result
				);
		}
	}

	private callSiteId(): number {
		const stackTrace = new Error().stack;
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
}

export const hookManager = new HookManager();
