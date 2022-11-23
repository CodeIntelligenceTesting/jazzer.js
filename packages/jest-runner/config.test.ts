/*
 * Copyright 2022 Code Intelligence GmbH
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

import { defaultOptions, loadConfig } from "./config";

describe("Config", () => {
	describe("loadConfig", () => {
		it("returns default configuration if nothing found", () => {
			expect(loadConfig()).toEqual(defaultOptions);
		});

		it("merges found and default options", () => {
			const config = loadConfig("test-jazzerjs");
			expect(config).not.toEqual(defaultOptions);
			expect(config.includes).toContain("target");
			expect(config.excludes).toContain("nothing");
		});
	});
});
