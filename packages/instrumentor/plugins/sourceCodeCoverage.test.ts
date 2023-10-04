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

import * as libCoverage from "istanbul-lib-coverage";

import { fuzzer } from "@jazzer.js/fuzzer";

import { ZeroEdgeIdStrategy } from "../edgeIdStrategy";
import { Instrumentor } from "../instrument";

import { codeCoverage } from "./codeCoverage";
import { sourceCodeCoverage } from "./sourceCodeCoverage";
import { removeIndentation } from "./testhelpers";

jest.mock("@jazzer.js/fuzzer");

/* eslint no-var: 0 */
declare global {
	var __coverage__: libCoverage.CoverageMapData;
	var Fuzzer: typeof fuzzer;
}
global.Fuzzer = fuzzer;

// Each test instruments, evaluates instrumented code, and checks the coverage data accumulated
// in the global variable __coverage__.
describe("Source code coverage instrumentation", () => {
	it("No code, expect no coverage", () => {
		const code = ``;
		instrumentAndEval(code);
		expect(getStatementMap()).toEqual({});
		expect(getFunctionMap()).toEqual({});
		expect(getBranchMap()).toEqual({});
		// Check coverage data
		expect(getCoveredStatements()).toEqual({});
		expect(getCoveredFunctions()).toEqual({});
		expect(getCoveredBranches()).toEqual({});
	});
	it("Statements should be all covered", () => {
		const code = `
		    |let x; // this is not a statement
		    |x = 1;
            |x++;
            |x++;
            `;
		instrumentAndEval(code);
		const statementMap = getStatementMap();
		expect(statementMap["0"]).toEqual(makeCoverageRange(2, 2, 0, 6));
		expect(statementMap["1"]).toEqual(makeCoverageRange(3, 3, 0, 4));
		expect(statementMap["2"]).toEqual(makeCoverageRange(4, 4, 0, 4));
		expect(Object.keys(statementMap).length).toEqual(3);
		expect(getBranchMap()).toEqual({});
		expect(getFunctionMap()).toEqual({});
		// Check coverage data
		expect(getCoveredStatements()).toEqual({ "0": 1, "1": 1, "2": 1 });
		expect(getCoveredFunctions()).toEqual({});
		expect(getCoveredBranches()).toEqual({});
	});
	it("Functions: foo covered twice; bar uncovered", () => {
		const code = `
		    |function foo() {
		    |return 1;
		    |}
		    |function bar() {
		    |return 1;
		    |}
		    |foo();
		    |foo();
            `;
		instrumentAndEval(code);
		// Check positions of functions, statements, and branches
		const statementMap = getStatementMap();
		expect(statementMap["0"]).toEqual(makeCoverageRange(2, 2, 0, 9));
		expect(statementMap["1"]).toEqual(makeCoverageRange(5, 5, 0, 9));
		expect(statementMap["2"]).toEqual(makeCoverageRange(7, 7, 0, 6));
		expect(statementMap["3"]).toEqual(makeCoverageRange(8, 8, 0, 6));
		expect(Object.keys(statementMap).length).toEqual(4);
		const functionMap = getFunctionMap();
		expect(functionMap["0"]).toEqual(
			makeFunctionMapping("foo", 1, 1, 9, 12, 1, 3, 15, 1, 1),
		);
		expect(functionMap["1"]).toEqual(
			makeFunctionMapping("bar", 4, 4, 9, 12, 4, 6, 15, 1, 4),
		);
		expect(Object.keys(functionMap).length).toEqual(2);
		expect(getBranchMap()).toEqual({}); // program has no branches
		// Check coverage data
		expect(getCoveredStatements()).toEqual({ "0": 2, "1": 0, "2": 1, "3": 1 });
		expect(getCoveredFunctions()).toEqual({ "0": 2, "1": 0 });
		expect(getCoveredBranches()).toEqual({});
	});
	it("Branches coverage", () => {
		const code = `
		    |let x;
		    |if (true) {
		    |x++;
		    |} else {
		    |x--;
		    |}
            `;
		instrumentAndEval(code);
		const statementMap = getStatementMap();
		expect(statementMap["0"]).toEqual(makeCoverageRange(2, 6, 0, 1));
		expect(statementMap["1"]).toEqual(makeCoverageRange(3, 3, 0, 4));
		expect(statementMap["2"]).toEqual(makeCoverageRange(5, 5, 0, 4));
		expect(Object.keys(statementMap).length).toEqual(3);
		const branchMap = getBranchMap();
		expect(branchMap["0"].loc).toEqual(makeCoverageRange(2, 6, 0, 1));
		expect(branchMap["0"].locations[0]).toEqual(makeCoverageRange(2, 6, 0, 1));
		expect(branchMap["0"].locations[1]).toEqual(makeCoverageRange(4, 6, 7, 1)); // else
		expect(Object.keys(branchMap).length).toEqual(1);
		expect(getFunctionMap()).toEqual({});
		// Check coverage data
		expect(getCoveredStatements()).toEqual({ "0": 1, "1": 1, "2": 0 });
		expect(getCoveredFunctions()).toEqual({});
		expect(getCoveredBranches()).toEqual({ "0": [1, 0] });
	});
});

const mockFilename = "testfile.js";

function getStatementMap() {
	return global.__coverage__[mockFilename].statementMap;
}

function getFunctionMap() {
	return global.__coverage__[mockFilename].fnMap;
}

function getBranchMap() {
	return global.__coverage__[mockFilename].branchMap;
}

function getCoveredStatements() {
	return global.__coverage__[mockFilename].s;
}

function getCoveredFunctions() {
	return global.__coverage__[mockFilename].f;
}

function getCoveredBranches() {
	return global.__coverage__[mockFilename].b;
}

function instrumentAndEval(input: string) {
	const code = removeIndentation(input);
	const instrumentor = new Instrumentor();
	const plugins = [
		sourceCodeCoverage(mockFilename),
		codeCoverage(new ZeroEdgeIdStrategy()),
	];
	const instrumented =
		instrumentor.transform(mockFilename, code, plugins)?.code || code;
	eval(instrumented);
}

function makeCoverageRange(
	startLine: number,
	endLine: number,
	startColumn: number,
	endColumn: number,
): libCoverage.Range {
	return {
		start: { line: startLine, column: startColumn },
		end: { line: endLine, column: endColumn },
	};
}

function makeFunctionMapping(
	name: string,
	declStartLine: number,
	declEndLine: number,
	declStartColumn: number,
	declEndColumn: number,
	locStartLine: number,
	locEndLine: number,
	locStartColumn: number,
	locEndColumn: number,
	line: number,
): libCoverage.FunctionMapping {
	return {
		name: name,
		decl: makeCoverageRange(
			declStartLine,
			declEndLine,
			declStartColumn,
			declEndColumn,
		),
		loc: makeCoverageRange(
			locStartLine,
			locEndLine,
			locStartColumn,
			locEndColumn,
		),
		line: line,
	};
}
