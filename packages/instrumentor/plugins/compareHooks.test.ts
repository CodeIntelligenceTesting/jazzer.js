import { compareHooks } from "./compareHooks";
import { instrumentAndEvalWith } from "./testhelpers";

const native = mockNativePluginApi();

const expectInstrumentation = instrumentAndEvalWith(compareHooks);

describe("compare hooks instrumentation", () => {
	describe("string compares", () => {
		it("intercepts equals (`==` and `===`)", () => {
			native.traceStrCmp.mockClear().mockReturnValue(false);

			const input = `
			|let a = "a"
			|a === "b" == "c"`;
			const output = `
			|let a = "a";
			|fuzzer.traceStrCmp(fuzzer.traceStrCmp(a, "b", "==="), "c", "==");`;

			const result = expectInstrumentation<boolean>(input, output);
			expect(result).toBe(false);
			expect(native.traceStrCmp).toHaveBeenCalledTimes(2);
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(1, "a", "b", "===");
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(2, false, "c", "==");
		});

		it("intercepts not equals (`!=` and `!==`)", () => {
			native.traceStrCmp.mockClear().mockReturnValue(true);

			const input = `
			|let a = "a"
			|a !== "b" != "c"`;
			const output = `
			|let a = "a";
			|fuzzer.traceStrCmp(fuzzer.traceStrCmp(a, "b", "!=="), "c", "!=");`;

			const result = expectInstrumentation<boolean>(input, output);
			expect(result).toBe(true);
			expect(native.traceStrCmp).toHaveBeenCalledTimes(2);
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(1, "a", "b", "!==");
			expect(native.traceStrCmp).toHaveBeenNthCalledWith(2, true, "c", "!=");
		});
	});
});

// Mock global native plugin API
// This is normally done by the jest environment. Here we replace every
// API function with a jest mock, which can be configured in the test.
function mockNativePluginApi() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const native = require("../native");
	jest.mock("../native");
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	global.fuzzer = native;
	return native;
}
