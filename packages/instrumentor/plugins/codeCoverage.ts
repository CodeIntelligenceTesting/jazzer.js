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

import { PluginTarget, types } from "@babel/core";

import { EdgeIdStrategy } from "../edgeIdStrategy";

import {
	EdgeLocation,
	makeCoverageVisitor,
	StringInterner,
} from "./coverageVisitor";
import type { EdgeEntry } from "./esmCodeCoverage";

export interface CjsCoverageResult {
	plugin: () => PluginTarget;
	/** Deduplicated function name table accumulated so far. */
	funcNames: () => string[];
	/** Edge entries accumulated since the last clear(). */
	edgeEntries: () => EdgeEntry[];
	/** Reset accumulated entries — call after registering each file's locations. */
	clear: () => void;
}

export function cjsCoverage(idStrategy: EdgeIdStrategy): CjsCoverageResult {
	const funcNames = new StringInterner();
	const entries: EdgeEntry[] = [];

	const onEdge = (loc: EdgeLocation): void => {
		const id = idStrategy.peekNextEdgeId();
		entries.push([
			id,
			loc.line,
			loc.col,
			funcNames.intern(loc.func),
			loc.isFuncEntry ? 1 : 0,
		]);
	};

	return {
		plugin: () => ({
			visitor: makeCoverageVisitor(
				() =>
					types.callExpression(
						types.identifier("Fuzzer.coverageTracker.incrementCounter"),
						[types.numericLiteral(idStrategy.nextEdgeId())],
					),
				onEdge,
			),
		}),
		funcNames: () => funcNames.strings(),
		edgeEntries: () => entries,
		clear: () => {
			entries.length = 0;
			funcNames.clear();
		},
	};
}

export function codeCoverage(idStrategy: EdgeIdStrategy): () => PluginTarget {
	return cjsCoverage(idStrategy).plugin;
}
