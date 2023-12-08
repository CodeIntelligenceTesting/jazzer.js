/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import { getOrSetJazzerJsGlobal } from "./api";

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
		this._afterEachCallbacks.forEach((c) => c());
	}

	runBeforeEachCallbacks() {
		this._beforeEachCallbacks.forEach((c) => c());
	}
}

const defaultCallbacks = new Callbacks();
export function getCallbacks(): Callbacks {
	return getOrSetJazzerJsGlobal("callbacks", defaultCallbacks);
}

export function registerAfterEachCallback(callback: Thunk) {
	getCallbacks().registerAfterEachCallback(callback);
}

export function registerBeforeEachCallback(callback: Thunk) {
	getCallbacks().registerBeforeEachCallback(callback);
}
