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

export type Thunk = () => void;

/**
 * Callbacks can be registered in fuzz targets or bug detectors to be executed
 * before or after each fuzz target invocation.
 */
export class Callbacks {
	private _afterEachCallbacks: Array<Thunk> = [];
	private _beforeEachCallbacks: Array<Thunk> = [];

	registerAfterEachCallback(callback: Thunk) {
		this._afterEachCallbacks.push(callback);
	}

	registerBeforeEachCallback(callback: Thunk) {
		this._beforeEachCallbacks.push(callback);
	}

	runAfterEachCallbacks() {
		for (const c of this._afterEachCallbacks) {
			c();
		}
	}

	runBeforeEachCallbacks() {
		for (const c of this._beforeEachCallbacks) {
			c();
		}
	}
}

export const callbacks = new Callbacks();

export function registerAfterEachCallback(callback: Thunk) {
	callbacks.registerAfterEachCallback(callback);
}

export function registerBeforeEachCallback(callback: Thunk) {
	callbacks.registerBeforeEachCallback(callback);
}
