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

export function fuzz(data: Uint8Array) {
	const s = data.toString();
	if (s.length > 6) {
		if (
			s.slice(0, 3) === "CIF" &&
			s[3] === "U" &&
			s[4] == "Z" &&
			s[5] == "Z" &&
			s[6] == "!"
		) {
			throw Error("Welcome to Awesome Fuzzing!");
		}
	}
}
