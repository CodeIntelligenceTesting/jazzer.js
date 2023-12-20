/* eslint-disable header/header */

const lib = require("./lib");

/**
 * @param { Buffer } data
 */
module.exports.fuzz = function (data) {
	console.log("DATA: " + data.toString());
	if (data.length < 3) {
		return;
	}
	lib.foo(data[0]);
};
