// eslint-disable-next-line @typescript-eslint/no-var-requires
const parsers = require("@stoplight/spectral-parsers");

module.exports.fuzz = function (data) {
	parsers.Json.parse(data.toString());
};
