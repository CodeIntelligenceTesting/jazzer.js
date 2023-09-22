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

declare global {
	// eslint-disable-next-line no-var
	var JazzerJS: Map<string, unknown> | undefined;
}

// Require the external initialization to set this map in the globalThis object
// before it is used here.
export const jazzerJs = new Map<string, unknown>();

export function setJazzerJsGlobal<T>(name: string, value: T): void {
	if (!globalThis.JazzerJS) {
		throw new Error("JazzerJS global not initialized");
	}
	globalThis.JazzerJS.set(name, value);
}

export function getJazzerJsGlobal<T>(name: string): T | undefined {
	return globalThis.JazzerJS?.get(name) as T;
}

export function getOrSetJazzerJsGlobal<T>(name: string, defaultValue: T): T {
	const value = getJazzerJsGlobal<T>(name);
	if (value === undefined) {
		setJazzerJsGlobal(name, defaultValue);
		return defaultValue;
	}
	return value;
}
