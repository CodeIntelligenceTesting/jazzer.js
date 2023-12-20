/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import * as crypto from "crypto";

export function fuzzMe(data: Buffer) {
	if (typeof data === "object") {
		if (data.toString() === "Awesome") {
			throw Error("Welcome to Awesome Fuzzing!");
		}
		return data;
	}
	// Implicit else block to test coverage error,
	// see: https://github.com/vitest-dev/vitest/pull/2275
	return data;
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

export function fuzzMeHashed(data: Buffer) {
	const s = data.toString();
	if (s.length !== 7) {
		return;
	}

	const sha = crypto.createHash("sha512").update(s);
	const result = sha.digest("hex");

	// Hash of "Amazing"
	if (
		result ===
		"79328e1e1272ff2890ff0c6e8181a52ce5960ae7703b00f9f094edd7dbd198210129b2bb307e8cd34d689d101e4d685f1259e42af7ce252944ca46aecca60752"
	) {
		throw Error("Welcome to Amazing Fuzzing!");
	}
}
