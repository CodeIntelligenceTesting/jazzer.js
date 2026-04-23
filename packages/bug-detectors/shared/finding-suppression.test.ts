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

import {
	buildGenericSuppressionSnippet,
	getUserFacingStack,
	IgnoreList,
	matchesIgnoreRules,
} from "./finding-suppression";

describe("finding suppression", () => {
	const stack = [
		"Error",
		"    at renderTemplate (C:\\repo\\tests\\bug-detectors\\sample.test.js:10:42)",
		"    at handleRequest (/repo/src/server.js:20:7)",
		"    at internal (/repo/jazzer.js/packages/core/core.js:30:1)",
	].join("\n");

	test("keeps the shown stack text unchanged for matching", () => {
		expect(getUserFacingStack(stack)).toBe(
			[
				"    at renderTemplate (C:\\repo\\tests\\bug-detectors\\sample.test.js:10:42)",
				"    at handleRequest (/repo/src/server.js:20:7)",
			].join("\n"),
		);
	});

	test("matches string stack patterns against the shown stack", () => {
		expect(
			matchesIgnoreRules(
				[
					{
						stackPattern:
							"C:\\repo\\tests\\bug-detectors\\sample.test.js:10:42",
					},
				],
				stack,
			),
		).toBe(true);
		expect(
			matchesIgnoreRules(
				[
					{
						stackPattern: "C:/repo/tests/bug-detectors/sample.test.js:10:42",
					},
				],
				stack,
			),
		).toBe(false);
	});

	test("matches regex stack patterns against the shown stack", () => {
		expect(
			matchesIgnoreRules(
				[{ stackPattern: /handleRequest \(\/repo\/src\/server\.js:20:7\)/ }],
				stack,
			),
		).toBe(true);
	});

	test("IgnoreList stores and matches suppression rules", () => {
		const ignoreList = new IgnoreList();

		ignoreList.add({ stackPattern: "sample.test.js:10:42" });

		expect(ignoreList.matches(stack)).toBe(true);
	});

	test("prints generic example snippets with optional chaining", () => {
		expect(
			buildGenericSuppressionSnippet("code-injection", "ignoreInvocation"),
		).toContain('getBugDetectorConfiguration("code-injection")');
		expect(
			buildGenericSuppressionSnippet("code-injection", "ignoreInvocation"),
		).toContain("?.ignoreInvocation({");
		expect(
			buildGenericSuppressionSnippet("code-injection", "ignoreInvocation"),
		).toContain('stackPattern: "test.js:10"');
		expect(
			buildGenericSuppressionSnippet("code-injection", "ignoreInvocation"),
		).toContain("shown stack above");
	});
});
