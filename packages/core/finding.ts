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

import { EOL } from "os";
import { sep } from "path";
import process from "process";

import { getJazzerJsGlobal, setJazzerJsGlobal } from "./api";

const firstFinding = "firstFinding";

export class Finding extends Error {}

export class FuzzerSignalFinding extends Finding {
	public readonly exitCode: number;
	constructor(signal: number) {
		super(
			signal == 11
				? "Segmentation Fault"
				: `Fuzzing stopped by signal ${signal}`,
		);
		// Signals should exit with code 128+n, see
		// https://tldp.org/LDP/abs/html/exitcodes.html
		this.exitCode = signal === 0 ? 0 : 128 + signal;
	}
}

// The first finding reported by any bug detector will be saved in the global jazzerJs object.
// This variable has to be cleared every time when the fuzzer is finished
// processing an input (only relevant for modes where the fuzzing continues
// after finding an error, e.g. fork mode, Jest regression mode, fuzzing that
// ignores errors mode, etc.).

function getFirstFinding(): Finding | undefined {
	return getJazzerJsGlobal(firstFinding);
}

export function clearFirstFinding(): Finding | undefined {
	const lastFinding = getFirstFinding();
	setJazzerJsGlobal(firstFinding, undefined);
	return lastFinding;
}

/**
 * Save the first finding reported by any bug detector.
 *
 * @param cause - The finding to be reported.
 * @param containStack - Whether the finding should contain a stack trace or not.
 */
export function reportFinding(
	cause: string | Finding,
	containStack = true,
): Finding | undefined {
	// After saving the first finding, ignore all subsequent errors.
	if (getFirstFinding()) {
		return;
	}
	if (typeof cause === "string") {
		cause = new Finding(cause);
	}
	if (!containStack) {
		cause.stack = cause.message;
	}
	setJazzerJsGlobal(firstFinding, cause);
	return cause;
}

/**
 * Save the first finding reported by any bug detector and throw it to
 * potentially abort the current execution.
 *
 * @param cause - The finding to be saved and thrown.
 * @param containStack - Whether the finding should contain a stack trace or not.
 */
export function reportAndThrowFinding(
	cause: string | Finding,
	containStack = true,
): void | never {
	throw reportFinding(cause, containStack);
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
		print("Uncaught Exception: ");
	}
	// Error could be emitted from within another environment (e.g. vm, window, frame),
	// hence, don't rely on instanceof checks.
	if (isError(error)) {
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

function isError(arg: unknown): arg is Error {
	return (
		arg !== undefined && arg !== null && (arg as Error).message !== undefined
	);
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
		`..${sep}..${sep}packages${sep}`, // local/filesystem dependencies
	];
	error.stack = error.stack
		.split("\n")
		.filter(
			(line) => !filterCriteria.some((criterion) => line.includes(criterion)),
		)
		.join("\n");
}

export function errorName(error: unknown): string {
	if (error instanceof Error) {
		// error objects
		return error.name;
	} else if (typeof error !== "object") {
		// primitive types
		return String(error);
	} else {
		// Arrays and objects can not be converted to a proper name and so
		// not be stated as expected error.
		return "unknown";
	}
}
