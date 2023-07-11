/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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

	const name = code.encrypt(data.readInt32BE(0), code.ReturnType.SYNC);
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
