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

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	modulePathIgnorePatterns: ["packages/fuzzer/build", "tests/code_coverage"],
	testPathIgnorePatterns: ["/dist/", "/node_modules/"],
	testMatch: ["<rootDir>/packages/**/*.test.[jt]s"],
	collectCoverageFrom: ["packages/**/*.ts"],
	coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				// ts-jest does not support composite project references.
				// It compiles workspace .ts sources in one flat program,
				// which breaks cross-package type resolution.  Disabling
				// diagnostics lets tsc -b (which does understand project
				// refs) be the single source of truth for type checking.
				diagnostics: false,
			},
		],
	},
};
