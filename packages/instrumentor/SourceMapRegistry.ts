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

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { RawSourceMap } from "source-map";
import sms from "source-map-support";

export interface SourceMaps {
	[file: string]: SourceMap | undefined;
}

export type SourceMap = {
	version: number;
	sources: string[];
	names: string[];
	sourceRoot?: string | undefined;
	sourcesContent?: string[] | undefined;
	mappings: string;
	file: string;
};

// Regex to extract inline source maps from code strings. The regex is based on
// the one used by the convert-source-map library. It captures the base64
// encoded source map in capture group 5.
const regex = RegExp(
	"^\\s*?\\/[/*][@#]\\s+?sourceMappingURL=data:(((?:application|text)\\/json)(?:;charset=([^;,]+?)?)?)?(?:;(base64))?,(.*?)$",
	"mg",
);

const URL_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

/**
 * Extracts the inline source map from a code string.
 *
 * Inline source maps can be added to the end of a code file during offline
 * and online transpilation. Babel transformers or the TypeScript compiler
 * are examples of this.
 */
export function extractInlineSourceMap(code: string): SourceMap | undefined {
	const match = regex.exec(code);
	if (match) {
		const buf = Buffer.from(match[5], "base64");
		return JSON.parse(buf.toString());
	}
}

/**
 * Extracts a source map from code, preferring inline data URLs and
 * falling back to file-based sourceMappingURL comments.
 */
export function extractSourceMap(
	code: string,
	filename: string,
): SourceMap | undefined {
	return (
		extractInlineSourceMap(code) ?? extractExternalSourceMap(code, filename)
	);
}

function extractExternalSourceMap(
	code: string,
	filename: string,
): SourceMap | undefined {
	const sourceMapUrl = extractSourceMapUrl(code);
	if (!sourceMapUrl || sourceMapUrl.startsWith("data:")) {
		return;
	}

	const sanitizedUrl = sourceMapUrl.split("#", 1)[0].split("?", 1)[0];
	const mapPath = resolveSourceMapPath(filename, sanitizedUrl);
	if (!mapPath) {
		return;
	}

	try {
		const mapContent = fs.readFileSync(mapPath, "utf8");
		return JSON.parse(mapContent);
	} catch {
		return;
	}
}

function extractSourceMapUrl(code: string): string | undefined {
	let lineEnd = code.length;
	while (lineEnd > 0) {
		let lineStart = code.lastIndexOf("\n", lineEnd - 1);
		lineStart = lineStart === -1 ? 0 : lineStart + 1;

		const sourceMapUrl = parseSourceMapDirective(
			code.slice(lineStart, lineEnd).trim(),
		);
		if (sourceMapUrl) {
			return sourceMapUrl;
		}

		if (lineStart === 0) {
			break;
		}

		lineEnd = lineStart - 1;
		if (lineEnd > 0 && code[lineEnd - 1] === "\r") {
			lineEnd--;
		}
	}
}

function parseSourceMapDirective(line: string): string | undefined {
	if (!line) {
		return;
	}

	let body: string;
	if ((line.startsWith("//#") || line.startsWith("//@")) && line.length >= 3) {
		body = line.slice(3);
	} else if (
		(line.startsWith("/*#") || line.startsWith("/*@")) &&
		line.length >= 3
	) {
		body = line.endsWith("*/") ? line.slice(3, -2) : line.slice(3);
	} else {
		return;
	}

	body = body.trimStart();
	const directive = "sourceMappingURL=";
	if (!body.startsWith(directive)) {
		return;
	}

	const sourceMapUrl = body.slice(directive.length).trim();
	return sourceMapUrl || undefined;
}

function resolveSourceMapPath(
	filename: string,
	sourceMapUrl: string,
): string | undefined {
	if (!sourceMapUrl) {
		return;
	}

	if (sourceMapUrl.startsWith("file://")) {
		return fileURLToPath(sourceMapUrl);
	}
	if (URL_PREFIX.test(sourceMapUrl)) {
		return;
	}

	let decodedUrl = sourceMapUrl;
	try {
		decodedUrl = decodeURIComponent(sourceMapUrl);
	} catch {
		// Keep undecoded value if it contains invalid escapes.
	}

	return path.resolve(path.dirname(filename), decodedUrl);
}

export function toRawSourceMap(
	sourceMap?: SourceMap,
): RawSourceMap | undefined {
	if (sourceMap) {
		return {
			version: sourceMap.version.toString(),
			file: sourceMap.file,
			sources: sourceMap.sources ?? [],
			names: sourceMap.names,
			sourceRoot: sourceMap.sourceRoot,
			sourcesContent: sourceMap.sourcesContent,
			mappings: sourceMap.mappings,
		};
	}
}

export class SourceMapRegistry {
	private sourceMaps: SourceMaps = {};

	registerSourceMap(filename: string, sourceMap: SourceMap) {
		this.sourceMaps[filename] = sourceMap;
	}

	getSourceMap(filename: string): SourceMap | undefined {
		return this.sourceMaps[filename];
	}

	/* Installs source-map-support handlers and returns a reset function */
	installSourceMapSupport(): () => void {
		// Use the source-map-support library to enable in-memory source maps of
		// transformed code and error stack rewrites.
		// As there is no way to populate the source map cache of source-map-support,
		// an additional buffer is used to pass on the source maps from babel to the
		// library. This could be memory intensive and should be replaced by
		// tmp source map files, if it really becomes a problem.
		sms.install({
			hookRequire: true,
			retrieveSourceMap: (source) => {
				const sourceMap = toRawSourceMap(this.getSourceMap(source));
				return sourceMap
					? {
							map: sourceMap,
							url: source,
						}
					: null;
			},
		});
		return sms.resetRetrieveHandlers;
	}
}
