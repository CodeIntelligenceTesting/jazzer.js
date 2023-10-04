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

import fs from "fs";

import proto from "protobufjs";
import { temporaryWriteSync } from "tempy";

describe("protobufjs", () => {
	test.fuzz("loadSync", (data) => {
		const file = temporaryWriteSync(data);
		try {
			const root = proto.loadSync(file);
			if (root.toString().length >= 30) {
				console.error(
					"== Input: " + data.toString() + "\n== " + root.toString(),
				);
			}
		} catch (e) {
			if (
				e.name !== "SyntaxError" &&
				e.message &&
				!e.message.includes("illegal token") &&
				!e.message.includes("illegal string") &&
				!e.message.includes("illegal path") &&
				!e.message.includes("illegal comment") &&
				!e.message.includes("illegal reference") &&
				!e.message.includes("illegal name") &&
				!e.message.includes("illegal type") &&
				!e.message.includes("illegal value") &&
				!e.message.includes("illegal service") &&
				!e.message.includes("name must be a string") &&
				!e.message.includes("path must be relative") &&
				!e.message.includes("duplicate name") &&
				!e.message.includes("Unexpected token") &&
				!e.message.includes("Unexpected end")
			) {
				throw e;
			}
		} finally {
			fs.rmSync(file);
		}
	});
});
