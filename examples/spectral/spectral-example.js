const parsers = require("@stoplight/spectral-parsers");

module.exports.fuzz = function (data) {
	parsers.Json.parse(data.toString());
};
