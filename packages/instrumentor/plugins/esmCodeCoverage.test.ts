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

import { PluginItem, transformSync } from "@babel/core";

import { compareHooks } from "./compareHooks";
import { esmCodeCoverage } from "./esmCodeCoverage";
import { removeIndentation } from "./testhelpers";

function transform(
	code: string,
	extraPlugins: PluginItem[] = [],
): { code: string; edgeCount: number } {
	const coverage = esmCodeCoverage();
	const result = transformSync(removeIndentation(code), {
		filename: "test-module.mjs",
		plugins: [coverage.plugin, ...extraPlugins],
	});
	return {
		code: removeIndentation(result?.code),
		edgeCount: coverage.edgeCount(),
	};
}

describe("ESM code coverage instrumentation", () => {
	it("should emit direct array writes, not incrementCounter", () => {
		const { code, edgeCount } = transform(`
			|function foo() {
			|  return 1;
			|}`);

		expect(code).toContain("__jazzer_cov[0]");
		expect(code).not.toContain("incrementCounter");
		expect(edgeCount).toBe(1);
	});

	it("should implement NeverZero via % 255 + 1", () => {
		const { code } = transform(`
			|function foo() {
			|  return 1;
			|}`);

		expect(code).toContain("% 255");
		expect(code).toContain("+ 1");
		// Must NOT contain || or ?: to avoid infinite visitor recursion.
		expect(code).not.toMatch(/\|\||[?:]/);
	});

	it("should assign sequential module-local IDs", () => {
		const { code, edgeCount } = transform(`
			|function foo() {
			|  if (a) {
			|    return 1;
			|  } else {
			|    return 2;
			|  }
			|}`);

		// Function body, if-consequent, if-alternate, after-if
		expect(edgeCount).toBe(4);
		expect(code).toContain("__jazzer_cov[0]");
		expect(code).toContain("__jazzer_cov[1]");
		expect(code).toContain("__jazzer_cov[2]");
		expect(code).toContain("__jazzer_cov[3]");
	});

	it("should instrument all branch types", () => {
		const { edgeCount } = transform(`
			|function foo(x) {
			|  if (x > 0) { return 1; }
			|  switch (x) {
			|    case -1: return -1;
			|    default: return 0;
			|  }
			|  for (let i = 0; i < x; i++) { sum += i; }
			|  try { bar(); } catch (e) { log(e); }
			|  const y = x > 0 ? 1 : 0;
			|  const z = a || b;
			|}`);

		// This is a smoke test -- the exact count depends on how
		// many edges each construct produces.  We just verify the
		// number is reasonable (> 10 for this code) and non-zero.
		expect(edgeCount).toBeGreaterThan(10);
	});

	it("should start edge IDs at 0 for each new module", () => {
		const first = transform(`|function a() { return 1; }`);
		const second = transform(`|function b() { return 2; }`);

		// Both modules should use __jazzer_cov[0] since IDs are
		// module-local, not global.
		expect(first.code).toContain("__jazzer_cov[0]");
		expect(second.code).toContain("__jazzer_cov[0]");
		expect(first.edgeCount).toBe(1);
		expect(second.edgeCount).toBe(1);
	});

	it("should return 0 edges for code with no branches", () => {
		const { edgeCount } = transform(`|const x = 42;`);
		expect(edgeCount).toBe(0);
	});

	describe("combined with compareHooks", () => {
		it("should replace string-literal === with traceStrCmp", () => {
			const { code } = transform(
				`
				|export function check(s) {
				|  return s === "secret";
				|}`,
				[compareHooks],
			);

			// The === against a string literal must be replaced.
			expect(code).toContain("Fuzzer.tracer.traceStrCmp");
			expect(code).toContain('"secret"');
			expect(code).toContain('"==="');
			// The raw === should be gone from the check expression.
			expect(code).not.toMatch(/s\s*===\s*"secret"/);
		});

		it("should replace number-literal === with traceNumberCmp", () => {
			const { code } = transform(
				`
				|export function classify(n) {
				|  if (n > 10) return "big";
				|  if (n === 0) return "zero";
				|  return "small";
				|}`,
				[compareHooks],
			);

			expect(code).toContain("Fuzzer.tracer.traceNumberCmp");
		});

		it("should NOT hook variable-to-variable comparisons", () => {
			// compareHooks only fires when one operand is a literal.
			// Comparing two identifiers is not hooked (same as CJS).
			const { code } = transform(
				`
				|const target = "something";
				|export function check(s) {
				|  return s === target;
				|}`,
				[compareHooks],
			);

			expect(code).not.toContain("Fuzzer.tracer.traceStrCmp");
		});

		it("should hook slice-then-compare patterns", () => {
			// This is the pattern used in the integration tests.
			const { code } = transform(
				`
				|export function verify(s) {
				|  if (s.slice(0, 16) === "a]3;d*F!pk29&bAc") {
				|    throw new Error("found it");
				|  }
				|}`,
				[compareHooks],
			);

			expect(code).toContain("Fuzzer.tracer.traceStrCmp");
			expect(code).toContain("a]3;d*F!pk29&bAc");
		});

		it("should produce both coverage and hooks together", () => {
			const { code, edgeCount } = transform(
				`
				|export function check(s) {
				|  if (s === "secret") {
				|    return true;
				|  }
				|  return false;
				|}`,
				[compareHooks],
			);

			// Coverage counters from esmCodeCoverage
			expect(code).toContain("__jazzer_cov[");
			expect(edgeCount).toBeGreaterThan(0);
			// Compare hooks
			expect(code).toContain("Fuzzer.tracer.traceStrCmp");
		});
	});

	describe("logical expression handling", () => {
		it("should instrument nested logical expressions", () => {
			const { code, edgeCount } = transform(`
				|const x = a || b && c;`);

			// Should have instrumented the leaves of the logical tree.
			expect(edgeCount).toBeGreaterThanOrEqual(2);
			expect(code).toContain("__jazzer_cov[");
		});

		it("should not infinite-loop on complex logical chains", () => {
			// This would cause infinite recursion if the counter
			// expression contained || or &&.
			const { code, edgeCount } = transform(`
				|function f() {
				|  return a || b || c || d || e;
				|}`);

			expect(edgeCount).toBeGreaterThan(0);
			expect(code).toContain("__jazzer_cov[");
		});
	});
});
