/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import {
	getCallbacks,
	registerAfterEachCallback,
	registerBeforeEachCallback,
} from "./callback";

describe("callbacks", () => {
	beforeEach(() => {
		globalThis.JazzerJS = new Map();
	});

	it("executes registered beforeEach callbacks", () => {
		const callback = jest.fn();
		registerBeforeEachCallback(callback);
		registerBeforeEachCallback(callback);
		registerBeforeEachCallback(callback);
		const callbacks = getCallbacks();
		callbacks.runBeforeEachCallbacks();
		expect(callback).toBeCalledTimes(3);
	});

	it("executes registered afterEach callbacks", () => {
		const callback = jest.fn();
		registerAfterEachCallback(callback);
		registerAfterEachCallback(callback);
		registerAfterEachCallback(callback);
		const callbacks = getCallbacks();
		callbacks.runAfterEachCallbacks();
		expect(callback).toBeCalledTimes(3);
	});
});
