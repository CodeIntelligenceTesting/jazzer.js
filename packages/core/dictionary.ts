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

/**
 * Dictionaries can be used to provide additional mutation suggestions to the
 * fuzzer.
 */
export class Dictionaries {
	private _dictionary: string[] = [];

	get dictionary() {
		return this._dictionary;
	}

	addDictionary(dictionary: string[]) {
		this._dictionary.push(dictionary.join("\n"));
	}
}

export const dictionaries = new Dictionaries();

export function addDictionary(...dictionary: string[]) {
	dictionaries.addDictionary(dictionary);
}
