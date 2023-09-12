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
import { EOL } from "os";
import { sep } from "path";

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

export function clearFirstFinding(): Finding | undefined {
	const lastFinding = firstFinding;
	firstFinding = undefined;
	return lastFinding;
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
 * Prints a finding, or more generally some kind of error, to stderr.
 */
export function printFinding(
	error: unknown,
	print: (msg: string) => void = process.stderr.write.bind(process.stderr),
): void {
	print(`==${process.pid}== `);
	if (!(error instanceof Finding)) {
		print("Uncaught Exception: Jazzer.js: ");
	}
	if (error instanceof Error) {
		if (error.stack) {
			cleanErrorStack(error);
			print(error.stack);
		} else {
			print(error.message);
		}
	} else if (typeof error === "string" || error instanceof String) {
		print(error.toString());
	} else {
		print("unknown");
	}
	print(EOL);
}

interface WithStack {
	stack?: string;
}

function hasStack(arg: unknown): arg is WithStack {
	return (
		arg !== undefined && arg !== null && (arg as WithStack).stack !== undefined
	);
}

export function cleanErrorStack(error: unknown): void {
	if (!hasStack(error) || !error.stack) return;
	if (error instanceof Finding) {
		// Remove the "Error :" prefix of the finding message from the stack trace.
		error.stack = error.stack.replace(
			`Error: ${error.message}\n`,
			`${error.message}\n`,
		);
	}
	// Ignore all lines related to Jazzer.js internals. This includes stack frames on top,
	// like bug detector and reporting ones, and stack frames on the bottom, like the function
	// wrapper.
	const filterCriteria = [
		`@jazzer.js${sep}`, // cli usage
		`jazzer.js${sep}packages${sep}`, // jest usage
		`jazzer.js${sep}core${sep}`, // jest usage
		`..${sep}..${sep}packages${sep}core${sep}`, // local/filesystem dependencies
	];
	error.stack = error.stack
		.split("\n")
		.filter(
			(line) => !filterCriteria.some((criterion) => line.includes(criterion)),
		)
		.join("\n");
}
