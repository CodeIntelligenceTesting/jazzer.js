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

export function fuzzMe(data: Buffer) {
	if (data.toString() === "Awesome") {
		throw Error("Welcome to Awesome Fuzzing!");
	}
}

export function callbackFuzzMe(data: Buffer, done: (e?: Error) => void) {
	// Use setImmediate here to unblock the event loop but still have better
	// performance compared to setTimeout.
	setImmediate(() => {
		try {
			fuzzMe(data);
			done();
		} catch (e: unknown) {
			if (e instanceof Error) {
				done(e);
			} else {
				done(new Error(`Error: ${e}`));
			}
		}
	});
}

export async function asyncFuzzMe(data: Buffer) {
	return new Promise((resolve, reject) => {
		callbackFuzzMe(data, (e?: Error) => {
			if (e) {
				reject(e);
			} else {
				resolve(null);
			}
		});
	});
}
