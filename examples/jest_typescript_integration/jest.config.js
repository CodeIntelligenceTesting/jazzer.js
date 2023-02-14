// can be uncommented to force fuzzing on which may be useful in e.g. vscode's jest UI to run fuzzing on a single test
// process.env.JAZZER_FUZZ = 1;
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	projects: [
		{
			preset: "ts-jest",
			displayName: "tests",
			modulePathIgnorePatterns: ["dist"],
		},
		{
			preset: "ts-jest",
			runner: "@jazzer.js/jest-runner",
			testEnvironment: "node",
			modulePathIgnorePatterns: [
				"dist",
				"packages/fuzzer/build",
				"tests/code_coverage",
			],
			transformIgnorePatterns: ["node_modules"],
			testMatch: ["<rootDir>/*.fuzz.[jt]s"],
			coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
		},
	],
	collectCoverageFrom: ["**/*.ts"],
};
