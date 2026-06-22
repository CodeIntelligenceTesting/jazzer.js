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

import { ensureCanary } from "./code-injection-canary";

const descriptorFactory = (canaryName: string): PropertyDescriptor => ({
	get: () => canaryName,
	configurable: false,
});

describe("code injection canary", () => {
	test("reuses an already installed canary", () => {
		const target = {};
		const cache = new WeakMap<object, string>();

		expect(ensureCanary(on(target), cache, descriptorFactory)).toBe("jaz_zer");
		expect(ensureCanary(on(target), cache, descriptorFactory)).toBe("jaz_zer");
	});

	test("suffixes the canary name when the default one is already taken", () => {
		const target = { jaz_zer: true };
		const cache = new WeakMap<object, string>();

		expect(ensureCanary(on(target), cache, descriptorFactory)).toBe(
			"jaz_zer_1",
		);
	});

	test("continues when an earlier target rejects the canary", () => {
		const lockedTarget = Object.preventExtensions({});
		const openTarget = {};
		const cache = new WeakMap<object, string>();

		expect(() => {
			ensureCanary(
				[
					{ label: "globalThis", object: lockedTarget },
					{ label: "vmContext", object: openTarget },
				],
				cache,
				descriptorFactory,
			);
		}).not.toThrow();
		expect(openTarget).toHaveProperty("jaz_zer", "jaz_zer");
	});

	test("caches canary names per target", () => {
		const defaultTarget = {};
		const suffixedTarget = { jaz_zer: true };
		const cache = new WeakMap<object, string>();

		expect(ensureCanary(on(defaultTarget), cache, descriptorFactory)).toBe(
			"jaz_zer",
		);
		expect(ensureCanary(on(suffixedTarget), cache, descriptorFactory)).toBe(
			"jaz_zer_1",
		);
		expect(ensureCanary(on(defaultTarget), cache, descriptorFactory)).toBe(
			"jaz_zer",
		);
		expect(ensureCanary(on(suffixedTarget), cache, descriptorFactory)).toBe(
			"jaz_zer_1",
		);
	});

	test("fails loudly when no target accepts the canary", () => {
		const lockedTarget = Object.preventExtensions({});
		const cache = new WeakMap<object, string>();

		expect(() => {
			ensureCanary(
				[{ label: "globalThis", object: lockedTarget }],
				cache,
				descriptorFactory,
			);
		}).toThrow(/could not install a canary on any available global object/i);
		expect(() => {
			ensureCanary(
				[{ label: "globalThis", object: lockedTarget }],
				cache,
				descriptorFactory,
			);
		}).toThrow(/--disableBugDetectors=code-injection/);
	});
});

function on(object: object) {
	return [{ label: "target", object }];
}
