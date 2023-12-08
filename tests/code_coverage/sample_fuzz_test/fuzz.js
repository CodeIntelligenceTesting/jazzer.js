/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

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
