/*
 * Copyright 2026 Code Intelligence GmbH
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

import { registerAfterEachCallback } from "./callback";
import { asFindingAwareFuzzFn } from "./core";
import { clearFirstFinding, Finding, reportFinding } from "./finding";

describe("asFindingAwareFuzzFn", () => {
	let stderrWrite: jest.SpiedFunction<typeof process.stderr.write>;

	beforeEach(() => {
		globalThis.JazzerJS = new Map();
		stderrWrite = jest
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
	});

	afterEach(() => {
		stderrWrite.mockRestore();
		clearFirstFinding();
	});

	it("surfaces afterEach findings from async done callbacks", async () => {
		registerAfterEachCallback(() => reportFinding("afterEach finding", false));
		const wrappedFn = asFindingAwareFuzzFn(
			(_data, done: (err?: Error) => void) => {
				setTimeout(() => done(), 0);
			},
			false,
		);

		await new Promise<void>((resolve, reject) => {
			wrappedFn(Buffer.from(""), (error?: Error) => {
				try {
					expect(error).toBeInstanceOf(Finding);
					expect(error?.message).toBe("afterEach finding");
					resolve();
				} catch (e) {
					reject(e);
				}
			});
		});
	});
});
