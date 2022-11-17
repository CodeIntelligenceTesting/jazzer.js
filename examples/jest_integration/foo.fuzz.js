/* eslint no-undef: 0 */
require("@jazzer.js/jest");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const foo = require("./foo");

describe("My describe", () => {
	it("My unit test", () => {
		expect(1 + 3).toEqual(4);
	});

	it("My unit test2", () => {
		expect(1 + 3).toEqual(4);
	});

	it.fuzz("My fuzz test", (data) => {
		foo.fuzzMe(data);
	});

	//
	// it.fuzz("second fuzz target", (data) => {
	// 	// fuzz test throwing an error
	// 	if (data.toString() === "c") {
	// 		throw Error("Error from fuzz test");
	// 	}
	// });
	//
	// it.fuzz("missing arg", () => {
	// 	// fuzz test without explicit arg should be called nevertheless
	// });
	//
	// it.fuzz("async fuzz target", (data, done) => {
	// 	// fuzz test using done callback
	// 	if (data.toString() === "c") {
	// 		done(new Error("Done error"));
	// 	} else {
	// 		done();
	// 	}
	// });
	//
	// it.fuzz("promise fuzz target", async (data) => {
	// 	// async fuzz test
	// 	await new Promise((resolve, reject) => {
	// 		setTimeout(() => {
	// 			if (data.toString() === "c") {
	// 				reject("rejected");
	// 			} else {
	// 				resolve("resolved");
	// 			}
	// 		}, 10);
	// 	});
	// });
});
