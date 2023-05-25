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

export interface TrackedHook {
	target: string;
	pkg: string;
}

// HookTracker keeps track of hooks that were applied, are available, and were not applied.
// This is helpful when debugging custom hooks and bug detectors.
class HookTracker {
	private _applied = new HookTable();
	private _available = new HookTable();
	private _notApplied = new HookTable();

	print() {
		console.log("DEBUG: [Hook] Summary:");
		console.log("DEBUG: [Hook]    Not applied: " + this._notApplied.length);
		this._notApplied.serialize().forEach((hook) => {
			console.log(`DEBUG: [Hook] not applied: ${hook.pkg} -> ${hook.target}`);
		});
		console.log("DEBUG: [Hook]    Applied: " + this._applied.length);
		this._applied.serialize().forEach((hook) => {
			console.log(`DEBUG: [Hook] applied:     ${hook.pkg} -> ${hook.target}`);
		});
		console.log("DEBUG: [Hook]    Available: " + this._available.length);
		this._available.serialize().forEach((hook) => {
			console.log(`DEBUG: [Hook] available:   ${hook.pkg} -> ${hook.target}`);
		});
	}

	categorizeUnknown(requestedHooks: Hook[]): this {
		requestedHooks.forEach((hook) => {
			if (
				!this._applied.has(hook.pkg, hook.target) &&
				!this._available.has(hook.pkg, hook.target)
			) {
				this.addNotApplied(hook.pkg, hook.target);
			}
		});
		return this;
	}

	clear() {
		this._applied.clear();
		this._notApplied.clear();
		this._available.clear();
	}

	addApplied(pkg: string, target: string) {
		this._applied.add(pkg, target);
	}

	addAvailable(pkg: string, target: string) {
		this._available.add(pkg, target);
	}

	addNotApplied(pkg: string, target: string) {
		this._notApplied.add(pkg, target);
	}

	get applied(): TrackedHook[] {
		return this._applied.serialize();
	}

	get available(): TrackedHook[] {
		return this._available.serialize();
	}

	get notApplied(): TrackedHook[] {
		return this._notApplied.serialize();
	}
}

// Stores package names and names of functions of interest (targets) from that package  [packageName0 -> [target0, ...], ...].
// This structure is used to keep track of all functions seen during instrumentation and execution of the fuzzing run,
// to determine which hooks have been applied, are available, and have not been applied.
class HookTable {
	hooks: Map<string, Set<string>> = new Map();

	add(pkg: string, target: string) {
		if (!this.hooks.has(pkg)) {
			this.hooks.set(pkg, new Set());
		}
		this.hooks.get(pkg)?.add(target);
	}

	has(pkg: string, target: string) {
		if (!this.hooks.has(pkg)) {
			return false;
		}
		return this.hooks.get(pkg)?.has(target);
	}

	serialize(): TrackedHook[] {
		const result: TrackedHook[] = [];
		for (const [pkg, targets] of [...this.hooks].sort()) {
			for (const target of [...targets].sort()) {
				result.push({ pkg: pkg, target: target });
			}
		}
		return result;
	}

	clear() {
		this.hooks.clear();
	}

	get length() {
		let size = 0;
		for (const targets of this.hooks.values()) {
			size += targets.size;
		}
		return size;
	}
}

export function logHooks(hooks: Hook[]) {
	hooks.forEach((hook) => {
		if (process.env.JAZZER_DEBUG) {
			console.log(
				`DEBUG: Applied %s-hook in %s#%s`,
				HookType[hook.type],
				hook.pkg,
				hook.target
			);
		}
	});
}

export const hookTracker = new HookTracker();

/*eslint @typescript-eslint/no-explicit-any: 0 */
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
