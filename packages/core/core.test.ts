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

import { ensureFilepath } from "./core";
import path from "path";

describe("core", () => {
	describe("ensuresFilepath", () => {
		it("adds .js suffix if none or unsupported one is present", () => {
			expect(ensureFilepath("filename")).toMatch(/.*filename.js$/);
			expect(ensureFilepath("filename.xyz")).toMatch(/.*filename\.xyz\.js$/);
			expect(ensureFilepath("filename.js")).toMatch(/.*filename\.js$/);
			expect(ensureFilepath("filename.mjs")).toMatch(/.*filename\.mjs$/);
			expect(ensureFilepath("filename.cjs")).toMatch(/.*filename\.cjs$/);
		});
		it("adds file schema", () => {
			expect(ensureFilepath("filename.js")).toMatch(/^file:\/\/.*/);
		});
		it("adds current working directory to filename", () => {
			const expectedPath = path.join(process.cwd(), "filename.js");
			expect(ensureFilepath("filename.js")).toMatch(expectedPath);
		});
	});
});
