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

import { PluginTarget } from "@babel/core";
import { Instrumentor } from "../instrument";

export function instrumentAndEvalWith(...plugins: PluginTarget[]) {
	const instrument = instrumentWith(plugins);
	return <T>(input: string, output: string): T =>
		eval(instrument(input, output)) as T;
}

export function instrumentWith(...plugins: PluginTarget[]) {
	return (input: string, output: string): string =>
		expectInstrumentation(plugins, input, output);
}

function expectInstrumentation(
	plugins: PluginTarget[],
	input: string,
	output: string,
): string {
	const code = removeIndentation(input);
	const instrumentor = new Instrumentor();
	const result = instrumentor.transform("test.js", code, plugins)?.code || code;
	expect(removeIndentation(result)).toBe(removeIndentation(output));
	return result;
}

export function removeIndentation(text?: string | null): string {
	return text ? text.replace(/^\s*\|/gm, "").replace(/^\s*[\n\r]+/gm, "") : "";
}
