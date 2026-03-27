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

import * as path from "path";
import { fileURLToPath } from "url";

import { SourceMapConsumer } from "source-map";

import type { EdgeEntry } from "./plugins/esmCodeCoverage";
import { SourceMap, toRawSourceMap } from "./SourceMapRegistry";

export interface PCLocationBatch {
	filename: string;
	entries: Int32Array;
}

interface RemappedPosition {
	filename: string;
	line: number;
	col: number;
}

const URL_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export function buildPCLocationBatches(
	edgeEntries: EdgeEntry[],
	generatedFilename: string,
	sourceMap: SourceMap | undefined,
	normalizeFilename: (filename: string) => string = (filename) => filename,
): PCLocationBatch[] {
	if (edgeEntries.length === 0) {
		return [];
	}

	if (!sourceMap) {
		return [
			{
				filename: normalizeFilename(generatedFilename),
				entries: flattenEntries(edgeEntries),
			},
		];
	}

	const rawSourceMap = toRawSourceMap(sourceMap);
	if (!rawSourceMap) {
		return [
			{
				filename: normalizeFilename(generatedFilename),
				entries: flattenEntries(edgeEntries),
			},
		];
	}

	let consumer: SourceMapConsumer;
	try {
		consumer = new SourceMapConsumer(rawSourceMap);
	} catch {
		return [
			{
				filename: normalizeFilename(generatedFilename),
				entries: flattenEntries(edgeEntries),
			},
		];
	}

	const grouped = new Map<string, number[]>();
	const remapCache = new Map<string, RemappedPosition | null>();

	for (const [edgeId, line, col, funcIdx, isFuncEntry] of edgeEntries) {
		let targetFilename = normalizeFilename(generatedFilename);
		let targetLine = line;
		let targetCol = col;

		if (line > 0) {
			const cacheKey = `${line}:${col}`;
			let remapped = remapCache.get(cacheKey);
			if (remapped === undefined) {
				const original = consumer.originalPositionFor({ line, column: col });
				if (
					original.source &&
					original.line !== null &&
					original.column !== null
				) {
					remapped = {
						filename: normalizeFilename(
							resolveOriginalSourcePath(
								original.source,
								sourceMap,
								generatedFilename,
							),
						),
						line: original.line,
						col: original.column,
					};
				} else {
					remapped = null;
				}
				remapCache.set(cacheKey, remapped);
			}

			if (remapped) {
				targetFilename = remapped.filename;
				targetLine = remapped.line;
				targetCol = remapped.col;
			}
		}

		const batch = grouped.get(targetFilename) ?? [];
		batch.push(edgeId, targetLine, targetCol, funcIdx, isFuncEntry);
		if (!grouped.has(targetFilename)) {
			grouped.set(targetFilename, batch);
		}
	}

	return Array.from(grouped.entries()).map(([filename, flat]) => ({
		filename,
		entries: Int32Array.from(flat),
	}));
}

function flattenEntries(edgeEntries: EdgeEntry[]): Int32Array {
	const flat = new Int32Array(edgeEntries.length * 5);
	for (let i = 0; i < edgeEntries.length; i++) {
		const e = edgeEntries[i];
		flat[i * 5] = e[0];
		flat[i * 5 + 1] = e[1];
		flat[i * 5 + 2] = e[2];
		flat[i * 5 + 3] = e[3];
		flat[i * 5 + 4] = e[4];
	}
	return flat;
}

function resolveOriginalSourcePath(
	source: string,
	sourceMap: SourceMap,
	generatedFilename: string,
): string {
	if (source.startsWith("file://")) {
		return fileURLToPath(source);
	}
	if (path.isAbsolute(source) || path.win32.isAbsolute(source)) {
		return source;
	}
	if (URL_PREFIX.test(source)) {
		return source;
	}

	const sourceRoot = sourceMap.sourceRoot;
	if (!sourceRoot) {
		return path.resolve(path.dirname(generatedFilename), source);
	}

	if (sourceRoot.startsWith("file://")) {
		return path.resolve(fileURLToPath(sourceRoot), source);
	}
	if (path.isAbsolute(sourceRoot) || path.win32.isAbsolute(sourceRoot)) {
		return path.resolve(sourceRoot, source);
	}
	if (URL_PREFIX.test(sourceRoot)) {
		return source;
	}

	return path.resolve(path.dirname(generatedFilename), sourceRoot, source);
}
