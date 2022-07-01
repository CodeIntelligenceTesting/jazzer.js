import { transformSync } from "@babel/core";
import { codeCoverage } from "./codeCoverage";

let native = require("../../native");
jest.mock("../../native");

native.nextCounter.mockReturnValue(0);

describe("code coverage instrumentation", () => {
	describe("IfStatement", () => {
		it("should add counter in consequent branch and afterwards", () => {
			let input = `
               |if (1 < 2)
               |  true;`;
			let output = `
               |if (1 < 2) {
               |  incrementCounter(0);
               |  true;
               |}
               |
               |incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
		it("should add counter in alternate branch and afterwards", () => {
			let input = `
               |if (1 < 2)
               |  true;
               |else
               |  false;`;
			let output = `
               |if (1 < 2) {
               |  incrementCounter(0);
               |  true;
               |} else {
               |  incrementCounter(0);
               |  false;
               |}
               |
               |incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("SwitchStatement", () => {
		it("should add counter in case and afterwards", () => {
			let input = `
               |switch(a) {
               |  case 1: true;
               |  case 2: false; break;
               |  default: true;
               |}`;
			let output = `
               |switch (a) {
               |  case 1:
               |    incrementCounter(0);
               |    true;
               |
               |  case 2:
               |    incrementCounter(0);
               |    false;
               |    break;
               |
               |  default:
               |    incrementCounter(0);
               |    true;
               |}
               |
               |incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("TryStatement", () => {
		it("should add counter in catch block and afterwards", () => {
			let input = `
               |try {
               |  dangerousCall();
               |} catch (e) {
               |  console.error(e, e.stack);
               |}`;
			let output = `
               |try {
               |  dangerousCall();
               |} catch (e) {
               |  incrementCounter(0);
               |  console.error(e, e.stack);
               |}
               |
               |incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("Loop", () => {
		it("should add counter in loop and afterwards", () => {
			let input = `
               |for(let i = 0; i < 100; i++) {
               |  counter++
               |}`;
			let output = `
               |for (let i = 0; i < 100; i++) {
               |  incrementCounter(0);
               |  counter++;
               |}
               |
               |incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});

	describe("Function", () => {
		it("should add counter in function", () => {
			let input = `
               |let foo = function add(a) {
               |  return (b) => {
               |    return a + b;
               |  } 
               |};`;
			let output = `
               |let foo = function add(a) {
               |  incrementCounter(0);
               |  return b => {
               |    incrementCounter(0);
               |    return a + b;
               |  };
               |};`;
			expectInstrumentation(input, output);
		});
	});

	describe("LogicalExpression", () => {
		it("should add counters in leaves", () => {
			let input = `let condition = (a === "a" || (potentiallyNull ?? b === "b")) && c !== "c"`;
			let output = `let condition = ((incrementCounter(0), a === "a") || ((incrementCounter(0), potentiallyNull) ?? (incrementCounter(0), b === "b"))) && (incrementCounter(0), c !== "c");`;
			expectInstrumentation(input, output);
		});
	});

	describe("ConditionalExpression", () => {
		it("should add counters branches", () => {
			let input = `a === "a" ? true : false;`;
			let output = `
        |a === "a" ? (incrementCounter(0), true) : (incrementCounter(0), false);
        |incrementCounter(0);`;
			expectInstrumentation(input, output);
		});
	});
});

function expectInstrumentation(input: string, output: string) {
	let result = transformSync(removeIndentation(input), {
		plugins: [codeCoverage],
	});
	expect(result?.code).toBe(removeIndentation(output));
}

function removeIndentation(text: string): string {
	return text.replace(/^\s*\|/gm, "");
}
