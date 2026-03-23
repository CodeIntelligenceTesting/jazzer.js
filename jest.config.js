/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	modulePathIgnorePatterns: [
		"dist",
		"packages/fuzzer/build",
		"tests/code_coverage",
	],
	testMatch: ["<rootDir>/packages/**/*.test.[jt]s"],
	collectCoverageFrom: ["packages/**/*.ts"],
	coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
};
