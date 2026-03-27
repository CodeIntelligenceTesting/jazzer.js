/*
 * Copyright 2026 Code Intelligence GmbH
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

import { transformSync } from "@babel/core";

import { hookManager, HookType } from "@jazzer.js/hooking";

import { Instrumentor, SerializedHook } from "./instrument";
import { functionHooks } from "./plugins/functionHooks";

/**
 * These tests verify the ESM function-hook wiring: serialization of
 * hooks on the main thread, registration of stubs in a simulated
 * loader hookManager, and correct Babel output with matching IDs.
 *
 * We cannot spawn a real loader thread in a unit test, so we exercise
 * the same logic inline: register stub hooks in the global hookManager
 * (which the functionHooks plugin reads from) and verify the output.
 */

afterEach(() => {
	hookManager.clearHooks();
});

describe("ESM function hook serialization", () => {
	it("should serialize hooks with explicit IDs", () => {
		hookManager.registerHook(
			HookType.Before,
			"execSync",
			"child_process",
			false,
			() => {},
		);
		hookManager.registerHook(
			HookType.Replace,
			"fetch",
			"node-fetch",
			true,
			() => {},
		);

		const serialized: SerializedHook[] = hookManager.hooks.map(
			(hook, index) => ({
				id: index,
				type: hook.type,
				target: hook.target,
				pkg: hook.pkg,
				async: hook.async,
			}),
		);

		expect(serialized).toEqual([
			{
				id: 0,
				type: HookType.Before,
				target: "execSync",
				pkg: "child_process",
				async: false,
			},
			{
				id: 1,
				type: HookType.Replace,
				target: "fetch",
				pkg: "node-fetch",
				async: true,
			},
		]);
	});

	it("should round-trip through JSON (MessagePort serialization)", () => {
		hookManager.registerHook(HookType.After, "readFile", "fs", false, () => {});

		const serialized: SerializedHook[] = hookManager.hooks.map(
			(hook, index) => ({
				id: index,
				type: hook.type,
				target: hook.target,
				pkg: hook.pkg,
				async: hook.async,
			}),
		);

		// structuredClone simulates what MessagePort does
		const received = structuredClone(serialized);
		expect(received).toEqual(serialized);
		expect(received[0].type).toBe(HookType.After);
	});
});

describe("ESM function hook stub registration", () => {
	it("should produce matching IDs when stubs are registered in order", () => {
		// Simulate the main thread registering real hooks
		const realHook1 = hookManager.registerHook(
			HookType.Before,
			"execSync",
			"child_process",
			false,
			() => {},
		);
		const realHook2 = hookManager.registerHook(
			HookType.Replace,
			"connect",
			"net",
			false,
			() => {},
		);

		const mainId1 = hookManager.hookIndex(realHook1);
		const mainId2 = hookManager.hookIndex(realHook2);

		// Serialize
		const serialized: SerializedHook[] = hookManager.hooks.map(
			(hook, index) => ({
				id: index,
				type: hook.type,
				target: hook.target,
				pkg: hook.pkg,
				async: hook.async,
			}),
		);

		// Clear and re-register as the loader thread would
		hookManager.clearHooks();
		for (const h of serialized) {
			const stub = hookManager.registerHook(
				h.type,
				h.target,
				h.pkg,
				h.async,
				() => {},
			);
			expect(hookManager.hookIndex(stub)).toBe(h.id);
		}

		// IDs in the loader match the original main-thread IDs
		expect(hookManager.hookIndex(hookManager.hooks[0])).toBe(mainId1);
		expect(hookManager.hookIndex(hookManager.hooks[1])).toBe(mainId2);
	});
});

describe("ESM function hook Babel output", () => {
	it("should insert HookManager.callHook with the correct hook ID", () => {
		hookManager.registerHook(
			HookType.Before,
			"processInput",
			"target-pkg",
			false,
			() => {},
		);

		const result = transformSync(
			"function processInput(data) { return data.trim(); }",
			{
				filename: "/app/node_modules/target-pkg/index.js",
				plugins: [functionHooks("/app/node_modules/target-pkg/index.js")],
			},
		);

		expect(result?.code).toContain("HookManager.callHook(0,");
		expect(result?.code).toContain("this, [data]");
	});

	it("should not hook functions in non-matching files", () => {
		hookManager.registerHook(
			HookType.Before,
			"dangerous",
			"target-pkg",
			false,
			() => {},
		);

		const result = transformSync("function dangerous(x) { return x; }", {
			filename: "/app/node_modules/other-pkg/lib.js",
			plugins: [functionHooks("/app/node_modules/other-pkg/lib.js")],
		});

		expect(result?.code).not.toContain("HookManager.callHook");
	});

	it("should use sendHooksToLoader to serialize from Instrumentor", () => {
		hookManager.registerHook(
			HookType.Before,
			"exec",
			"child_process",
			false,
			() => {},
		);

		const instrumentor = new Instrumentor();

		// Without a port, sendHooksToLoader is a no-op (no crash)
		expect(() => instrumentor.sendHooksToLoader()).not.toThrow();
	});
});
