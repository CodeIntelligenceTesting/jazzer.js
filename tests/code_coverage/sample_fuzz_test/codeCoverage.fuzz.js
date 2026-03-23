/* eslint-disable header/header */

const target = require("./fuzz.js");

describe("My describe", () => {
	it.fuzz("My fuzz test", (data) => {
		target.fuzz(data);
	});
});
