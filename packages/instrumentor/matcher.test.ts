import { shouldInstrument } from "./matcher";

describe("shouldInstrument check", () => {
	it("should consider includes and excludes", () => {
		const check = shouldInstrument(["include"], ["exclude"]);
		expect(check("include")).toBeTruthy();
		expect(check("exclude")).toBeFalsy();
		expect(check("/some/package/include/files")).toBeTruthy();
		expect(check("/some/package/exclude/files")).toBeFalsy();
		expect(check("/something/else")).toBeFalsy();
	});

	it("should include everything with emptystring", () => {
		const check = shouldInstrument([""], []);
		expect(check("include")).toBeTruthy();
		expect(check("/something/else")).toBeTruthy();
	});

	it("should exclude with precedence", () => {
		const check = shouldInstrument(["include"], [""]);
		expect(check("/some/package/include/files")).toBeFalsy();
	});
});
