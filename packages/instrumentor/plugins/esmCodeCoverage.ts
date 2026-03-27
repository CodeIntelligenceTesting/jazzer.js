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
 * Coverage plugin for ES modules.
 *
 * Unlike the CJS variant (which calls Fuzzer.coverageTracker.incrementCounter),
 * this plugin emits direct writes to a module-local Uint8Array:
 *
 *     __jazzer_cov[id] = (__jazzer_cov[id] % 255) + 1
 *
 * Each module gets its own small counter buffer, registered independently
 * with libFuzzer.  Edge IDs start at 0 per module -- no global counter
 * coordination is needed.
 */

import { PluginTarget, types } from "@babel/core";
import { Expression } from "@babel/types";

import { makeCoverageVisitor } from "./coverageVisitor";

const COUNTER_ARRAY = "__jazzer_cov";

/**
 * Build a NeverZero increment expression:
 *
 *     __jazzer_cov[id] = (__jazzer_cov[id] % 255) + 1
 *
 * Values cycle 0 → 1 → 2 → … → 255 → 1 → 2 → …, never landing
 * on zero (which libFuzzer would interpret as "edge not hit").
 *
 * We deliberately avoid `|| 1` because Babel would re-visit the
 * generated LogicalExpression and trigger infinite recursion in
 * the coverage visitor.  The `% 255 + 1` form uses only binary
 * arithmetic, which the visitor does not handle.
 */
function neverZeroIncrement(id: number): Expression {
	const element = () =>
		types.memberExpression(
			types.identifier(COUNTER_ARRAY),
			types.numericLiteral(id),
			true, // computed: __jazzer_cov[N]
		);

	return types.assignmentExpression(
		"=",
		element(),
		types.binaryExpression(
			"+",
			types.binaryExpression("%", element(), types.numericLiteral(255)),
			types.numericLiteral(1),
		),
	);
}

export interface EsmCoverageResult {
	plugin: () => PluginTarget;
	edgeCount: () => number;
}

/**
 * Create a fresh ESM coverage plugin for one module.
 *
 * Call this once per module being instrumented.  After the Babel
 * transform finishes, `edgeCount()` returns the number of counters
 * the module needs so the loader can emit the right preamble.
 */
export function esmCodeCoverage(): EsmCoverageResult {
	let count = 0;

	return {
		plugin: () => ({
			visitor: makeCoverageVisitor(() => neverZeroIncrement(count++)),
		}),
		edgeCount: () => count,
	};
}
