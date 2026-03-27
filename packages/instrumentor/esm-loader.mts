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

/**
 * Node.js module-loader hook for ESM instrumentation.
 *
 * Registered via module.register() from registerInstrumentor().
 * Runs in a dedicated loader thread — it has no access to the
 * native fuzzer addon or to globalThis.Fuzzer.  All it does is
 * transform source code and hand it back.  The transformed code
 * executes in the main thread, where the Fuzzer global exists.
 */

import type { PluginItem } from "@babel/core";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Load CJS-compiled Babel plugins via createRequire so we don't
// depend on Node.js CJS-named-export detection (varies by version).
const require = createRequire(import.meta.url);
const { transformSync } =
	require("@babel/core") as typeof import("@babel/core");
const { esmCodeCoverage } =
	require("./plugins/esmCodeCoverage.js") as typeof import("./plugins/esmCodeCoverage.js");
const { compareHooks } =
	require("./plugins/compareHooks.js") as typeof import("./plugins/compareHooks.js");
const { sourceCodeCoverage } =
	require("./plugins/sourceCodeCoverage.js") as typeof import("./plugins/sourceCodeCoverage.js");

// Already-instrumented code contains this marker.
const INSTRUMENTATION_MARKER = "Fuzzer.coverageTracker.incrementCounter";

// Counter buffer variable injected into each instrumented module.
const COUNTER_ARRAY = "__jazzer_cov";

interface LoaderConfig {
	includes: string[];
	excludes: string[];
	coverage: boolean;
}

let config: LoaderConfig;

export function initialize(data: LoaderConfig): void {
	config = data;
}

interface LoadResult {
	format?: string;
	source?: string | ArrayBuffer | SharedArrayBuffer | Uint8Array;
	shortCircuit?: boolean;
}

type LoadFn = (
	url: string,
	context: { format?: string | null },
	nextLoad: (
		url: string,
		context: { format?: string | null },
	) => Promise<LoadResult>,
) => Promise<LoadResult>;

export const load: LoadFn = async function load(url, context, nextLoad) {
	const result = await nextLoad(url, context);

	if (result.format !== "module" || !result.source) {
		return result;
	}

	// Only instrument file:// URLs (skip builtins, data:, https:, etc.)
	if (!url.startsWith("file://")) {
		return result;
	}

	const filename = fileURLToPath(url);
	if (!shouldInstrument(filename)) {
		return result;
	}

	const code = result.source.toString();

	// Avoid double-instrumenting code already processed by the CJS path
	// or by the Jest transformer.
	if (code.includes(INSTRUMENTATION_MARKER)) {
		return result;
	}

	const instrumented = instrumentModule(code, filename);
	if (!instrumented) {
		return result;
	}

	return { ...result, source: instrumented };
};

// ── Instrumentation ──────────────────────────────────────────────

function instrumentModule(code: string, filename: string): string | null {
	const fuzzerCoverage = esmCodeCoverage();

	const plugins: PluginItem[] = [fuzzerCoverage.plugin, compareHooks];

	// When --coverage is active, also apply Istanbul instrumentation so
	// that ESM modules appear in the human-readable coverage report.
	// The plugin writes to globalThis.__coverage__ at runtime (on the
	// main thread), just like the CJS path does.
	if (config.coverage) {
		plugins.push(sourceCodeCoverage(filename));
	}

	let transformed: ReturnType<typeof transformSync>;
	try {
		transformed = transformSync(code, {
			filename,
			sourceFileName: filename,
			sourceMaps: true,
			plugins,
			sourceType: "module",
		});
	} catch {
		// Babel parse failures on non-JS assets should not crash the
		// loader — fall through and return the original source.
		return null;
	}

	const edges = fuzzerCoverage.edgeCount();
	if (edges === 0 || !transformed?.code) {
		return null;
	}

	// Build a preamble that runs on the main thread before the module
	// body.  It allocates the per-module coverage counter buffer and,
	// when a source map is available, registers it with the main-thread
	// SourceMapRegistry so that source-map-support can remap stack
	// traces back to the original source.
	const preambleLines = [
		`const ${COUNTER_ARRAY} = Fuzzer.coverageTracker.createModuleCounters(${edges});`,
	];

	if (transformed.map) {
		// Shift the source map to account for the preamble lines we are
		// about to prepend.  In VLQ-encoded mappings each semicolon
		// represents one generated line; prepending them pushes all real
		// mappings down by the right amount.
		const preambleOffset = preambleLines.length + 1; // +1 for the registration line itself
		const shifted = {
			...transformed.map,
			mappings: ";".repeat(preambleOffset) + transformed.map.mappings,
		};
		preambleLines.push(
			`__jazzer_registerSourceMap(${JSON.stringify(filename)}, ${JSON.stringify(shifted)});`,
		);
	}

	return preambleLines.join("\n") + "\n" + transformed.code;
}

// ── Include / exclude filtering ──────────────────────────────────

function shouldInstrument(filepath: string): boolean {
	const { includes, excludes } = config;
	const included = includes.some((p) => filepath.includes(p));
	const excluded = excludes.some((p) => filepath.includes(p));
	return included && !excluded;
}
