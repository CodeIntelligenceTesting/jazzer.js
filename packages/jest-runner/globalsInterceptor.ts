/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import Runtime from "jest-runtime";

import { Options } from "@jazzer.js/core";

import { fuzz } from "./fuzz";
import { InterceptedTestState } from "./testStateInterceptor";

export function interceptGlobals(
	runtime: Runtime,
	testPath: string,
	jazzerConfig: Options,
	{
		currentTestState,
		currentTestTimeout,
		originalTestNamePattern,
	}: InterceptedTestState,
) {
	const originalSetGlobalsForRuntime =
		runtime.setGlobalsForRuntime.bind(runtime);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	runtime.setGlobalsForRuntime = (globals: any) => {
		globals.it.fuzz = fuzz(
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
			originalTestNamePattern,
			"standard",
		);
		globals.it.skip.fuzz = fuzz(
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
			originalTestNamePattern,
			"skip",
		);
		globals.it.only.fuzz = fuzz(
			globals,
			testPath,
			jazzerConfig,
			currentTestState,
			currentTestTimeout,
			originalTestNamePattern,
			"only",
		);
		originalSetGlobalsForRuntime(globals);
	};
}
