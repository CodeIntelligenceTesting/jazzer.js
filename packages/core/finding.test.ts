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

import { sep } from "path";

import { Finding, printFinding } from "./finding";
import { replaceAll } from "./utils";

describe("Finding", () => {
	it("print a cleaned up finding", () => {
		const printer = mockPrinter();
		const error = new Finding("Welcome to Awesome Fuzzing!");
		error.stack = withSystemSeparator(`Error: Welcome to Awesome Fuzzing!
        at Object.Error [as fuzzMe] (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/target.js:19:9)
        at fuzzMe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/integration.fuzz.js:30:11)
        at /home/Code-Intelligence/jazzer.js-commercial/packages/core/core.ts:341:5
        at /home/Code-Intelligence/jazzer.js-commercial/packages/jest-runner/fuzz.ts:152:6`);

		printFinding(error, printer);

		const lines = printer.printed().split("\n");
		expect(lines).toHaveLength(4);
		expect(lines[0]).toMatch(/==\d*== Welcome to Awesome Fuzzing!/);
		expect(lines[1]).toContain(
			withSystemSeparator(
				`        at Object.Error [as fuzzMe] (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/target.js:19:9)`,
			),
		);
		expect(lines[2]).toContain(
			withSystemSeparator(
				`        at fuzzMe (/home/Code-Intelligence/jazzer.js/tests/jest_integration/jest_project/integration.fuzz.js:30:11)`,
			),
		);
		expect(lines[3]).toEqual("");
	});

	it("print a cleaned up bug detector finding", () => {
		const printer = mockPrinter();
		const error = new Finding(
			"Command Injection in execSync(): called with 'jaz_zer'",
		);
		error.stack =
			withSystemSeparator(`Error: Command Injection in execSync(): called with 'jaz_zer'
    at reportFinding (/home/Code-Intelligence/jazzer.js/packages/core/finding.ts:54:1)
    at Hook.beforeHook [as hookFunction] (/home/Code-Intelligence/jazzer.js/packages/bug-detectors/internal/command-injection.ts:52:17)
    at Object.execSync (/home/Code-Intelligence/jazzer.js/packages/hooking/manager.ts:260:3)
    at test (/home/Code-Intelligence/jazzer.js/tests/bug-detectors/general/tests.fuzz.js:68:17)
    at /home/Code-Intelligence/jazzer.js/tests/bug-detectors/general/tests.fuzz.js:26:3
    at /home/Code-Intelligence/jazzer.js/packages/core/core.ts:341:5
    at /home/Code-Intelligence/jazzer.js/packages/jest-runner/fuzz.ts:152:6`);

		printFinding(error, printer);

		const lines = printer.printed().split("\n");
		expect(lines).toHaveLength(4);
		expect(lines[0]).toMatch(
			/==\d*== Command Injection in execSync\(\): called with 'jaz_zer'/,
		);
		expect(lines[1]).toContain(
			withSystemSeparator(
				`    at test (/home/Code-Intelligence/jazzer.js/tests/bug-detectors/general/tests.fuzz.js:68:17)`,
			),
		);
		expect(lines[2]).toContain(
			withSystemSeparator(
				`    at /home/Code-Intelligence/jazzer.js/tests/bug-detectors/general/tests.fuzz.js:26:3`,
			),
		);
		expect(lines[3]).toEqual("");
	});

	it("print error with inherited/stale stack (e.g. pdf.js BaseException)", () => {
		const printer = mockPrinter();
		// Simulate pdf.js's BaseException pattern: .name and .message are own
		// properties, but .stack is inherited from a prototype Error instance.
		const proto = new Error();
		const error = Object.create(proto) as Error;
		Object.defineProperty(error, "message", {
			value: "Command token too long: 128",
		});
		Object.defineProperty(error, "name", {
			value: "UnknownErrorException",
		});
		// error.stack is inherited from proto — stale "Error" header

		printFinding(error, printer);

		const output = printer.printed();
		expect(output).toContain("Uncaught Exception:");
		expect(output).toContain(
			"UnknownErrorException: Command token too long: 128",
		);
		expect(output).not.toMatch(/\nError[:\s]*\n/);
	});

	it("print error without stack shows name: message", () => {
		const printer = mockPrinter();
		const error = { name: "CustomError", message: "something broke" };

		printFinding(error as Error, printer);

		const output = printer.printed();
		expect(output).toContain("Uncaught Exception:");
		expect(output).toContain("CustomError: something broke");
	});

	it("print duck-typed error without .name falls back to Error", () => {
		const printer = mockPrinter();
		const error = { message: "oops" };

		printFinding(error as Error, printer);

		const output = printer.printed();
		expect(output).toContain("Uncaught Exception:");
		expect(output).toContain("Error: oops");
		expect(output).not.toContain("undefined");
	});
});

function mockPrinter() {
	const _messages: string[] = [];
	const printer = (msg: string) => {
		_messages.push(msg);
	};
	printer.printed = () => _messages.join("");
	return printer;
}

function withSystemSeparator(text: string): string {
	return replaceAll(text, /\//g, sep);
}
