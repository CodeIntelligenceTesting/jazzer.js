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
module.exports.fuzz = function (data) {
	const s = data.toString();
	if (s.length < 8) {
		return;
	}

	const s1 = s.slice(0, 8);
	const s2 = s.slice(8, 16);
	switch (s1) {
		case "Awesome ":
			if (s2 === "Fuzzing!") {
				throw Error("Welcome to Awesome Fuzzing");
			}
			break;
		case "Powerful":
			if (s2 === " Testing") {
				throw Error("Welcome to Powerful Testing");
			}
			break;
	}
};
