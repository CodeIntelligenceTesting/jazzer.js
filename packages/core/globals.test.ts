/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import {
	getJazzerJsGlobal,
	getOrSetJazzerJsGlobal,
	setJazzerJsGlobal,
} from "./globals";

describe("globals", () => {
	beforeEach(() => {
		globalThis.JazzerJS = new Map<string, unknown>();
	});

	it("should set and get a global", () => {
		setJazzerJsGlobal("test", 1);
		expect(getJazzerJsGlobal("test")).toBe(1);
	});

	it("should throw if not initialized", () => {
		globalThis.JazzerJS = undefined;
		expect(() => setJazzerJsGlobal("test", "foo")).toThrow();
	});

	it("should set default value if not already defined", () => {
		expect(getJazzerJsGlobal("test")).toBeUndefined();
		expect(getOrSetJazzerJsGlobal("test", "foo")).toBe("foo");
		expect(getOrSetJazzerJsGlobal("test", "baz")).toBe("foo");
	});
});
