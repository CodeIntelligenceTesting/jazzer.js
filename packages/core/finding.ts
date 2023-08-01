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

import process from "process";

export class Finding extends Error {}

// The first finding reported by any bug detector will be saved here.
// This variable has to be cleared every time when the fuzzer is finished
// processing an input (only relevant for modes where the fuzzing continues
// after finding an error, e.g. fork mode, Jest regression mode, fuzzing that
// ignores errors mode, etc.).
let firstFinding: Finding | undefined;

export function getFirstFinding(): Finding | undefined {
	return firstFinding;
}

export function clearFirstFinding(): void {
	firstFinding = undefined;
}

/**
 * Save the first finding reported by any bug detector and throw it to
 * potentially abort the current execution.
 *
 * @param findingMessage - The finding to be saved and thrown.
 */
export function reportFinding(findingMessage: string): void | never {
	// After saving the first finding, ignore all subsequent errors.
	if (firstFinding) {
		return;
	}
	firstFinding = new Finding(findingMessage);
	throw firstFinding;
}

/**
 * Prints a finding, or more generally some kind of error, to stdout.
 */
export function printFinding(error: unknown) {
	let errorMessage = `==${process.pid}== `;
	if (!(error instanceof Finding)) {
		errorMessage += "Uncaught Exception: Jazzer.js: ";
	}

	if (error instanceof Error) {
		errorMessage += error.message;
		console.log(errorMessage);
		if (error.stack) {
			console.log(cleanErrorStack(error));
		}
	} else if (typeof error === "string" || error instanceof String) {
		errorMessage += error;
		console.log(errorMessage);
	} else {
		errorMessage += "unknown";
		console.log(errorMessage);
	}
}

function cleanErrorStack(error: Error): string {
	if (error.stack === undefined) return "";

	// This cleans up the stack of a finding. The changes are independent of each other, since a finding can be
	// thrown from the hooking library, by the custom hooks, or by the fuzz target.
	if (error instanceof Finding) {
		// Remove the message from the stack trace. Also remove the subsequent line of the remaining stack trace that
		// always contains `reportFinding()`, which is not relevant for the user.
		error.stack = error.stack
			?.replace(`Error: ${error.message}\n`, "")
			.replace(/.*\n/, "");

		// Remove all lines up to and including the line that mentions the hooking library from the stack trace of a
		// finding.
		const stack = error.stack.split("\n");
		const index = stack.findIndex((line) =>
			line.includes("jazzer.js/packages/hooking/manager"),
		);
		if (index !== undefined && index >= 0) {
			error.stack = stack.slice(index + 1).join("\n");
		}

		// also delete all lines that mention "jazzer.js/packages/"
		error.stack = error.stack.replace(/.*jazzer.js\/packages\/.*\n/g, "");
	}

	const result: string[] = [];
	for (const line of error.stack.split("\n")) {
		if (line.includes("jazzer.js/packages/core/core.ts")) {
			break;
		}
		result.push(line);
	}
	return result.join("\n");
}
