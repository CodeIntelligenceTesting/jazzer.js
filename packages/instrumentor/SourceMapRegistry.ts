/*
 * Copyright 2023 Code Intelligence GmbH
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
	"mg"
);

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

export function toRawSourceMap(
	sourceMap?: SourceMap
): RawSourceMap | undefined {
	if (sourceMap) {
		return {
			version: sourceMap.version.toString(),
			sources: sourceMap.sources ?? [],
			names: sourceMap.names,
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
