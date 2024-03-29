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
