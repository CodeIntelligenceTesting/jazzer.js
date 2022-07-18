/*
 * Copyright 2022 Code Intelligence GmbH
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

import { BabelFileResult, PluginTarget, transformSync } from "@babel/core";

export function instrumentWith(...plugins: PluginTarget[]) {
	return (input: string, output: string) => {
		expectInstrumentation(plugins, input, output);
		return undefined;
	};
}

export function instrumentAndEvalWith(...plugins: PluginTarget[]) {
	return <T>(input: string, output: string): T | undefined => {
		const result = expectInstrumentation(plugins, input, output);
		if (result?.code) {
			return eval(result.code) as T;
		}
		return undefined;
	};
}

function expectInstrumentation(
	plugins: PluginTarget[],
	input: string,
	output: string
): BabelFileResult | null {
	const result = transformSync(removeIndentation(input), {
		plugins: plugins,
	});
	expect(result?.code).toBe(removeIndentation(output));
	return result;
}

function removeIndentation(text: string): string {
	return text.replace(/^\s*\|/gm, "");
}
