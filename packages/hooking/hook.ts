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

/*eslint @typescript-eslint/no-explicit-any: 0 */

class hookTracker {
	public applied: Set<string> = new Set();
	public available: Set<string> = new Set();
	public notApplied: Set<string> = new Set();

	print() {
		console.log("DEBUG: [Hook] Summary:");
		console.log("DEBUG: [Hook]    Not applied:");
		[...this.notApplied].sort().forEach((hook) => {
			console.log(`DEBUG: [Hook]      ${hook}`);
		});
		console.log("DEBUG: [Hook]    Applied:");
		[...this.applied].sort().forEach((hook) => {
			console.log(`DEBUG: [Hook]      ${hook}`);
		});
		console.log("DEBUG: [Hook]    Available:");
		[...this.available].sort().forEach((hook) => {
			console.log(`DEBUG: [Hook]      ${hook}`);
		});
	}

	categorizeUnknown(requestedHooks: Hook[]): this {
		requestedHooks.forEach((hook) => {
			if (!this.applied.has(hook.target) && !this.available.has(hook.target)) {
				this.notApplied.add(hook.target);
			}
		});
		return this;
	}

	clear() {
		this.applied.clear();
		this.notApplied.clear();
		this.available.clear();
	}
}

export const trackedHooks = new hookTracker();

export enum HookType {
	Before,
	After,
	Replace,
}

export type BeforeHookFn = (thisPtr: any, params: any[], hookId: number) => any;

export type ReplaceHookFn = (
	thisPtr: any,
	params: any[],
	hookId: number,
	// eslint-disable-next-line @typescript-eslint/ban-types
	origFn: Function
) => any;

export type AfterHookFn = (
	thisPtr: any,
	params: any[],
	hookId: number,
	result: any
) => any;

export type HookFn = BeforeHookFn | ReplaceHookFn | AfterHookFn;

export class Hook {
	constructor(
		public readonly type: HookType,
		public readonly target: string,
		public readonly pkg: string,
		public readonly async: boolean,
		public readonly hookFunction: HookFn
	) {}

	match(pkg: string, target: string): boolean {
		return pkg.includes(this.pkg) && target == this.target;
	}
}
