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

import "@jazzer.js/jest-runner";

import * as target from "./target";

describe("Jest TS Integration", () => {
	it.fuzz("execute sync test", (data: Buffer) => {
		target.fuzzMe(data);
	});

	it.fuzz("execute async test", async (data: Buffer) => {
		await target.asyncFuzzMe(data);
	});

	it.fuzz("execute async test returning a promise", (data: Buffer) => {
		return target.asyncFuzzMe(data);
	});

	it.fuzz(
		"execute async test using a callback",
		(data: Buffer, done: (e?: Error) => void) => {
			target.callbackFuzzMe(data, done);
		},
	);
});
