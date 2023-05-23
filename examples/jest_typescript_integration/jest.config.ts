import type { Config } from "jest";

const config: Config = {
	verbose: true,
	projects: [
		{
			displayName: "Jest",
			preset: "ts-jest",
		},
		{
			displayName: {
				name: "Jazzer.js",
				color: "cyan",
			},
			preset: "ts-jest",
			runner: "@jazzer.js/jest-runner",
			testEnvironment: "node",
			testMatch: ["<rootDir>/*.fuzz.[jt]s"],
		},
	],
	coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
	modulePathIgnorePatterns: ["/node_modules", "/dist/"],
};

export default config;
