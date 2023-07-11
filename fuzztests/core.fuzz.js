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

const { ensureFilepath } = require("@jazzer.js/core");

const cwd = process.cwd();

describe("core", () => {
	it.fuzz("ensureFilepath", (data) => {
		try {
			let filepath = ensureFilepath(data.toString());
			expect(filepath).toMatch(/.*\.(js|mjs|cjs)$/);
			expect(filepath).toMatch(/^file:\/\/.*/);
			expect(filepath.substring(7)).toContain(cwd);
		} catch (e) {
			if (e.matcherResult === undefined) {
				expect(e.message).toContain("Empty filepath provided");
			}
		}
	});
});
