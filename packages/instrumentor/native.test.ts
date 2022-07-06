import { traceStrCmp } from "./native";

describe("compare hooks", () => {
	it("traceStrCmp supports equals operators", () => {
		expect(traceStrCmp("a", "b", "==")).toBe(false);
		expect(traceStrCmp("a", "b", "===")).toBe(false);
		expect(traceStrCmp("a", "b", "!=")).toBe(true);
		expect(traceStrCmp("a", "b", "!==")).toBe(true);
	});
});
