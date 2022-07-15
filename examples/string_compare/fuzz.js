// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require("./lib");

function fuzz(data) {
	lib.fuzzMe(data);
}

exports.fuzz = fuzz;
