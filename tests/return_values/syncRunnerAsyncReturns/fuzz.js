/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const code = require("../exampleCode/code");

let syncCtr = 0;
let asyncCtr = 0;

/**
 * @param { Buffer } data
 */
module.exports.fuzz = function (data) {
	if (data.length < 16) {
		return;
	}

	const name = code.encrypt(data.readInt32BE(0), code.ReturnType.ASYNC);
	if (name instanceof Promise) {
		asyncCtr += 1;
	} else {
		syncCtr += 1;
	}
	if (asyncCtr + syncCtr > 100) {
		throw Error("Mixed return values condition reached!");
	}
	return name;
};
