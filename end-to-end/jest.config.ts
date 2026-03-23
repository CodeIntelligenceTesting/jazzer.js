/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */
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
			testRunner: "@jazzer.js/jest-runner",
			testEnvironment: "node",
			testMatch: ["<rootDir>/*.fuzz.[jt]s"],
		},
	],
	coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
	modulePathIgnorePatterns: ["/node_modules", "/dist/"],
};

export default config;
