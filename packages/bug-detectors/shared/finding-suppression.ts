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

const JAZZER_INTERNAL_STACK_MARKERS = [
	"/@jazzer.js/",
	"/jazzer.js/packages/",
	"/jazzer.js/core/",
	"/jazzer.js-commercial/packages/",
	"/jazzer.js-commercial/core/",
	"../../packages/",
];

/**
 * Defines a suppression rule for bug-detector findings.
 */
export interface IgnoreRule {
	/**
	 * A string or regular expression matching the stack excerpt shown in the
	 * finding after removing the leading Error line and Jazzer.js frames.
	 * @example "src/templates.js:41"
	 * @example /renderTemplate.*handleRequest/s
	 */
	stackPattern?: string | RegExp;
}

export class IgnoreList {
	private readonly _rules: IgnoreRule[] = [];

	add(rule: IgnoreRule): void {
		this._rules.push(rule);
	}

	matches(stack: string): boolean {
		return matchesIgnoreRules(this._rules, stack);
	}
}

export function matchesIgnoreRules(
	rules: IgnoreRule[],
	stack: string,
): boolean {
	return rules.some((rule) => matchesIgnoreRule(rule, stack));
}

export function buildGenericSuppressionSnippet(
	detectorName: string,
	suppressionMethod: string,
): string {
	return [
		'const { getBugDetectorConfiguration } = require("@jazzer.js/bug-detectors");',
		"",
		"// Example only: adapt `stackPattern` to the shown stack above.",
		`getBugDetectorConfiguration("${detectorName}")`,
		`  ?.${suppressionMethod}({`,
		'    stackPattern: "test.js:10",',
		"  });",
	].join("\n");
}

export function captureStack(): string {
	return new Error().stack ?? "";
}

export function getUserFacingStack(stack: string): string {
	return getUserFacingStackLines(stack).join("\n");
}

export function getUserFacingStackLines(stack: string): string[] {
	return stack
		.split("\n")
		.slice(1)
		.filter((line) => line !== "")
		.filter((line) => !isJazzerInternalStackLine(line));
}

function matchesIgnoreRule(rule: IgnoreRule, stack: string): boolean {
	return Boolean(
		rule.stackPattern &&
		matchesStackPattern(rule.stackPattern, getUserFacingStack(stack)),
	);
}

function isJazzerInternalStackLine(line: string): boolean {
	const normalizedLine = line.replace(/\\/g, "/");
	return JAZZER_INTERNAL_STACK_MARKERS.some((marker) =>
		normalizedLine.includes(marker),
	);
}

function matchesPattern(pattern: RegExp, value: string): boolean {
	pattern.lastIndex = 0;
	return pattern.test(value);
}

function matchesStackPattern(pattern: string | RegExp, value: string): boolean {
	if (typeof pattern === "string") {
		return value.includes(pattern);
	}
	return matchesPattern(pattern, value);
}
