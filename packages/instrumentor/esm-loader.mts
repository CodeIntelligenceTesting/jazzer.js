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
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { receiveMessageOnPort, type MessagePort } from "node:worker_threads";

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
const { functionHooks } =
	require("./plugins/functionHooks.js") as typeof import("./plugins/functionHooks.js");

// The loader thread has its own CJS module cache, so this is a
// separate HookManager instance from the main thread's.  We populate
// it with stub hooks from the serialized data we receive via the port.
const { hookManager: loaderHookManager } =
	require("@jazzer.js/hooking") as typeof import("@jazzer.js/hooking");

// Already-instrumented code contains this marker.
const INSTRUMENTATION_MARKER = "Fuzzer.coverageTracker.incrementCounter";

// Counter buffer variable injected into each instrumented module.
const COUNTER_ARRAY = "__jazzer_cov";

const PROJECT_ROOT_PREFIX = (() => {
	const cwd = path.resolve(process.cwd());
	return cwd.endsWith(path.sep) ? cwd : `${cwd}${path.sep}`;
})();

function stripProjectRootPrefix(filename: string): string {
	return filename.startsWith(PROJECT_ROOT_PREFIX)
		? filename.slice(PROJECT_ROOT_PREFIX.length)
		: filename;
}

interface LoaderConfig {
	includes: string[];
	excludes: string[];
	coverage: boolean;
	port?: MessagePort;
}

let config: LoaderConfig;
let loaderPort: MessagePort | null = null;

export function initialize(data: LoaderConfig): void {
	config = data;
	if (data.port) {
		loaderPort = data.port;
	}
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
	drainHookUpdates();

	const fuzzerCoverage = esmCodeCoverage();

	const plugins: PluginItem[] = [fuzzerCoverage.plugin, compareHooks];

	// When --coverage is active, also apply Istanbul instrumentation so
	// that ESM modules appear in the human-readable coverage report.
	// The plugin writes to globalThis.__coverage__ at runtime (on the
	// main thread), just like the CJS path does.
	if (config.coverage) {
		plugins.push(sourceCodeCoverage(filename));
	}

	// Apply function hooks if the main thread has sent hook definitions
	// and any of them target functions in this file.  The instrumented
	// code calls HookManager.callHook(id, ...) at runtime, which
	// resolves to the real hook function on the main thread.
	if (loaderHookManager.hasFunctionsToHook(filename)) {
		plugins.push(functionHooks(filename));
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
	const displayFilename = stripProjectRootPrefix(filename);

	// Build a preamble that runs on the main thread before the module
	// body.  It allocates the per-module coverage counter buffer and,
	// when a source map is available, registers it with the main-thread
	// SourceMapRegistry so that source-map-support can remap stack
	// traces back to the original source.
	const preambleLines = [
		`const {counters: ${COUNTER_ARRAY}, pcBase: __jazzer_pcBase} = Fuzzer.coverageTracker.createModuleCounters(${edges});`,
	];

	// Register edge-to-source mappings for PC symbolization.
	// Serialized as a flat array: [id, line, col, funcIdx, ...]
	const edgeEntries = fuzzerCoverage.edgeEntries();
	if (edgeEntries.length > 0) {
		const flat = edgeEntries.flat();
		const funcNames = fuzzerCoverage.funcNames();
		preambleLines.push(
			`Fuzzer.coverageTracker.registerPCLocations(` +
				`${JSON.stringify(displayFilename)},` +
				`${JSON.stringify(funcNames)},` +
				`new Int32Array(${JSON.stringify(flat)}),` +
				`__jazzer_pcBase);`,
		);
	}

	if (transformed.map) {
		// Shift the source map to account for the preamble lines we are
		// about to prepend.  In VLQ-encoded mappings each semicolon
		// represents one generated line; prepending them pushes all real
		// mappings down by the right amount.
		const preambleOffset = preambleLines.length + 1; // +1 for the source map line itself
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

// ── Function hooks from the main thread ──────────────────────────

interface SerializedHook {
	id: number;
	type: number;
	target: string;
	pkg: string;
	async: boolean;
}

const noop = () => {};

/**
 * Synchronously drain any hook-definition messages from the main
 * thread.  Uses receiveMessageOnPort — a non-blocking, synchronous
 * read — so we never have to await or restructure the load() flow.
 *
 * The main thread sends hook data after finalizeHooks() and before
 * user modules are loaded, so the message is always available by the
 * time we process user code.
 */
function drainHookUpdates(): void {
	if (!loaderPort) return;

	let msg;
	while ((msg = receiveMessageOnPort(loaderPort))) {
		const hooks = msg.message.hooks as SerializedHook[];
		for (const h of hooks) {
			const stub = loaderHookManager.registerHook(
				h.type,
				h.target,
				h.pkg,
				h.async,
				noop,
			);
			// Sanity check: the stub's index in the loader must match the
			// main thread's index so that runtime HookManager.callHook(id)
			// invokes the correct hook function.
			const actualId = loaderHookManager.hookIndex(stub);
			if (actualId !== h.id) {
				throw new Error(
					`ESM hook ID mismatch: expected ${h.id}, got ${actualId} ` +
						`for ${h.target} in ${h.pkg}`,
				);
			}
		}
	}
}

// ── Include / exclude filtering ──────────────────────────────────

function shouldInstrument(filepath: string): boolean {
	const { includes, excludes } = config;
	const included = includes.some((p) => filepath.includes(p));
	const excluded = excludes.some((p) => filepath.includes(p));
	return included && !excluded;
}
