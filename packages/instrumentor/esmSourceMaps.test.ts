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

import { compareHooks } from "./plugins/compareHooks";
import { esmCodeCoverage } from "./plugins/esmCodeCoverage";
import { SourceMap, SourceMapRegistry } from "./SourceMapRegistry";

const COUNTER_ARRAY = "__jazzer_cov";

/**
 * Replicate the ESM loader's instrumentModule logic so we can test
 * the source map handling without running a real loader thread.
 */
function instrumentModule(
	code: string,
	filename: string,
	extraPlugins: PluginItem[] = [],
): { source: string; map: SourceMap | null } | null {
	const fuzzerCoverage = esmCodeCoverage();
	const plugins: PluginItem[] = [
		fuzzerCoverage.plugin,
		compareHooks,
		...extraPlugins,
	];

	const transformed = transformSync(code, {
		filename,
		sourceFileName: filename,
		sourceMaps: true,
		plugins,
		sourceType: "module",
	});

	const edges = fuzzerCoverage.edgeCount();
	if (edges === 0 || !transformed?.code) {
		return null;
	}

	const preambleLines = [
		`const ${COUNTER_ARRAY} = Fuzzer.coverageTracker.createModuleCounters(${JSON.stringify(filename)}, ${edges});`,
	];

	let shiftedMap: SourceMap | null = null;
	if (transformed.map) {
		const preambleOffset = preambleLines.length + 1;
		shiftedMap = {
			...transformed.map,
			mappings: ";".repeat(preambleOffset) + transformed.map.mappings,
		} as SourceMap;
		preambleLines.push(
			`__jazzer_registerSourceMap(${JSON.stringify(filename)}, ${JSON.stringify(shiftedMap)});`,
		);
	}

	return {
		source: preambleLines.join("\n") + "\n" + transformed.code,
		map: shiftedMap,
	};
}

describe("ESM source map handling", () => {
	it("should produce a separate source map, not an inline one", () => {
		const result = instrumentModule(
			"export function greet() { return 'hi'; }",
			"/app/greet.mjs",
		);

		expect(result).not.toBeNull();
		expect(result!.source).not.toContain("sourceMappingURL=data:");
		expect(result!.map).not.toBeNull();
		expect(result!.map!.version).toBe(3);
	});

	it("should shift mappings by the number of preamble lines", () => {
		const result = instrumentModule(
			"export function greet() { return 'hi'; }",
			"/app/greet.mjs",
		);

		expect(result!.map).not.toBeNull();
		const mappings = result!.map!.mappings;

		// The preamble has 2 lines (counter allocation + source map registration).
		// Each prepended ";" represents an unmapped generated line.
		expect(mappings.startsWith(";;")).toBe(true);

		// The real mappings follow — they should not be empty.
		const realMappings = mappings.replace(/^;+/, "");
		expect(realMappings.length).toBeGreaterThan(0);
	});

	it("should embed a registration call in the preamble", () => {
		const filename = "/app/target.mjs";
		const result = instrumentModule(
			"export function check(s) { if (s === 'x') throw new Error(); }",
			filename,
		);

		const lines = result!.source.split("\n");

		// Line 1: counter allocation
		expect(lines[0]).toContain("Fuzzer.coverageTracker.createModuleCounters");

		// Line 2: source map registration with the correct filename
		expect(lines[1]).toContain("__jazzer_registerSourceMap");
		expect(lines[1]).toContain(JSON.stringify(filename));

		// The registration call should contain valid JSON for the source map
		const match = lines[1].match(/__jazzer_registerSourceMap\([^,]+, (.+)\);$/);
		expect(match).not.toBeNull();
		const embeddedMap = JSON.parse(match![1]);
		expect(embeddedMap.version).toBe(3);
		expect(embeddedMap.sources).toContain(filename);
	});

	it("should register maps with SourceMapRegistry via the global", () => {
		const registry = new SourceMapRegistry();
		const filename = "/app/module.mjs";
		const fakeMap: SourceMap = {
			version: 3,
			sources: [filename],
			names: [],
			mappings: "AAAA",
			file: filename,
		};

		// Simulate what Instrumentor.init() installs
		(globalThis as Record<string, unknown>).__jazzer_registerSourceMap = (
			f: string,
			m: SourceMap,
		) => registry.registerSourceMap(f, m);

		// Simulate what the preamble does at module evaluation time
		const register = (globalThis as Record<string, unknown>)
			.__jazzer_registerSourceMap as (f: string, m: SourceMap) => void;
		register(filename, fakeMap);

		expect(registry.getSourceMap(filename)).toEqual(fakeMap);

		// Cleanup
		delete (globalThis as Record<string, unknown>).__jazzer_registerSourceMap;
	});

	it("should preserve original source file in the map", () => {
		const filename = "/project/src/lib.mjs";
		const result = instrumentModule(
			[
				"export function add(a, b) {",
				"  return a + b;",
				"}",
				"export function sub(a, b) {",
				"  return a - b;",
				"}",
			].join("\n"),
			filename,
		);

		expect(result!.map!.sources).toContain(filename);
		expect(result!.map!.mappings.split(";").length).toBeGreaterThan(2);
	});
});
