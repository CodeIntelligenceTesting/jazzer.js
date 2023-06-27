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

describe("Target", () => {
	it.fuzz("executes sync methods", (data: Buffer) => {
		target.fuzzMe(data);
	});

	it.fuzz("executes async methods", async (data: Buffer) => {
		await target.asyncFuzzMe(data);
	});

	it.fuzz(
		"executes methods with a done callback",
		(data: Buffer, done: (e?: Error) => void) => {
			target.callbackFuzzMe(data, done);
		}
	);
});
