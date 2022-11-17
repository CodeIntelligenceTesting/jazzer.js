/*
 * Copyright 2022 Code Intelligence GmbH
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

/**
 * @param { Buffer } data
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FuzzedDataProvider } = require("@jazzer.js/core");

module.exports.fuzz = function (fuzzerInputData) {
	const data = new FuzzedDataProvider(fuzzerInputData);
	const s1 = data.consumeString(data.consumeIntegralInRange(1, 20), "utf-8");
	const s2 = data.consumeString(data.consumeIntegralInRange(1, 20), "utf-8");
	const i1 = data.consumeIntegral(1);
	const i2 = data.consumeIntegral(1);
	const i3 = data.consumeIntegral(2);
	const i4 = data.consumeIntegral(2);
	const i5 = data.consumeIntegral(1);
	var i6 = 0;
	if (data.consumeBoolean()) i6 = data.consumeIntegral(4);

	if (i6 === 1000) {
		if (s1 === "Hello!") {
			if (s2 === "World!") {
				if (i1 === 3) {
					if (i2 === 1) {
						if (i3 === 3) {
							if (i4 === 3) {
								if (i5 === 7) {
									throw new Error("Crash!");
								}
							}
						}
					}
				}
			}
		}
	}
};
