import {instrumentCode} from "./instrument"

describe("instrumentation", () => {
    describe("choice statements", () => {
        describe("IfStatement", () => {
            it("should add counter in consequent branch", () => {
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
                   |}`;
                expectInstrumentation(input, output);
            })
        })
    })
})

function expectInstrumentation(input: string, output: string) {
    expect(instrumentCode(removeIndentation(input))).toBe(removeIndentation(output));
}

function removeIndentation(text: string): string {
    return text.replace(/^\s*\|/gm,"")
}
