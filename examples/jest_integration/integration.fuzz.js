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

const target = require("./target.js");
const jpeg = require("jpeg-js");

describe("My describe", () => {
	describe("first inner describe", () => {
		it.fuzz("My fuzz test", (data) => {
			// console.log(
			// 	[...new Uint8Array(data)]
			// 		.map((x) => x.toString(16).padStart(2, "0"))
			// 		.join(" "),
			// );
			target.fuzzMe(data);
		});
		it.fuzz("Should be skipped", (data) => {
			// console.log(
			// 	[...new Uint8Array(data)]
			// 		.map((x) => x.toString(16).padStart(2, "0"))
			// 		.join(" "),
			// );

			try {
				jpeg.decode(data);
				// no changes to the fuzz target are necessary when using custom hooks
			} catch (error) {
				//console.log(error);
			}
			//target.fuzzMe(data);
		});

		it.fuzz("Should be skipped later", (data) => {
			// console.log(
			// 	[...new Uint8Array(data)]
			// 		.map((x) => x.toString(16).padStart(2, "0"))
			// 		.join(" "),
			// );

			target.fuzzMe(data);
		});
	});
	describe("other inner describe", () => {});
});
