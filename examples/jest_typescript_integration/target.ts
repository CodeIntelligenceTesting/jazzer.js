/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

export function fuzzMe(data: Buffer) {
	const s = data.toString();
	if (s.length !== 16) {
		return;
	}
	if (
		s.slice(0, 8) === "Awesome " &&
		s.slice(8, 15) === "Fuzzing" &&
		s[15] === "!"
	) {
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
