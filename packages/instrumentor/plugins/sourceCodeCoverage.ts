/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import { PluginTarget } from "@babel/core";
import { programVisitor, VisitorOptions } from "istanbul-lib-instrument";

export function sourceCodeCoverage(
	filename?: string,
	opts: Partial<VisitorOptions> = {},
): PluginTarget {
	return ({ types }) => {
		const ee = programVisitor(types, filename, opts);
		return {
			visitor: {
				Program: {
					enter: ee.enter,
					exit(path: string) {
						ee.exit(path);
					},
				},
			},
		};
	};
}
