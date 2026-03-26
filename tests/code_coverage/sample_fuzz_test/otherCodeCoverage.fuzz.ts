/* eslint-disable headers/header-format */

import "@jazzer.js/jest-runner";
import { fuzz } from "./fuzz.js";

describe("My describe", () => {
	test.fuzz("My fuzz test", (data: Buffer) => {
		fuzz(data);
	});
});
