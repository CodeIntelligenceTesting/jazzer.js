/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import "@jazzer.js/jest-runner";
import { fuzz } from "./fuzz.js";

describe("My describe", () => {
	test.fuzz("My fuzz test", (data: Buffer) => {
		fuzz(data);
	});
});
