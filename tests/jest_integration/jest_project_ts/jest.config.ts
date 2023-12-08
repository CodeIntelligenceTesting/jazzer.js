/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import type { Config } from "jest";

const config: Config = {
	projects: [
		{
			displayName: {
				name: "Jazzer.js",
				color: "cyan",
			},
			preset: "ts-jest",
			testRunner: "@jazzer.js/jest-runner",
			testEnvironment: "node",
			testMatch: ["<rootDir>/*.fuzz.ts"],
		},
	],
	collectCoverageFrom: ["*.ts"],
};

export default config;
