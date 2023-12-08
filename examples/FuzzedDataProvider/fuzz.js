/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const { FuzzedDataProvider } = require("@jazzer.js/core");

/**
 * @param { Buffer } fuzzerInputData
 */
module.exports.fuzz = function (fuzzerInputData) {
	const data = new FuzzedDataProvider(fuzzerInputData);
	const s1 = data.consumeString(data.consumeIntegralInRange(10, 15), "utf-8");
	const i1 = data.consumeIntegral(1);
	if (s1 === "Hello World!") {
		if (i1 === 3) {
			throw new Error("Crash!");
		}
	}
};
