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
import { addon } from "./addon";
import { tracer } from "./trace";

// Avoid loading the native addon, which is not available in the unit test
// environment. Only the tracing entry points used below are needed.
jest.mock("./addon", () => ({
	addon: {
		tracePcIndir: jest.fn(),
		traceUnequalStrings: jest.fn(),
		traceStringContainment: jest.fn(),
		traceIntegerCompare: jest.fn(),
	},
}));

describe("exploreState", () => {
	beforeEach(() => {
		(addon.tracePcIndir as jest.Mock).mockClear();
	});

	it("forwards a numeric state to the fuzzer", () => {
		tracer.exploreState(1337, 7);
		expect(addon.tracePcIndir).toHaveBeenCalledWith(7, 1337);
	});

	it("ignores non-numeric state", () => {
		tracer.exploreState("1337" as unknown as number, 7);
		expect(addon.tracePcIndir).not.toHaveBeenCalled();
	});

	it("ignores non-numeric id", () => {
		tracer.exploreState(1337, "7" as unknown as number);
		expect(addon.tracePcIndir).not.toHaveBeenCalled();
	});
});
