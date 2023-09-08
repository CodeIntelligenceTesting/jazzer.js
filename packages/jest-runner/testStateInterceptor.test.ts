/*
 * Copyright 2023 Code Intelligence GmbH
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

import { defaultOptions, Options } from "@jazzer.js/core";
import { interceptTestState } from "./testStateInterceptor";

describe("Test state interceptor", () => {
	it("hand back the latest describe block", () => {
		const { env, config } = mockEnvironment();

		const { currentTestState } = interceptTestState(env, config);

		env.publishEvent({}, { currentDescribeBlock: "state1" });
		expect(currentTestState()).toBe("state1");

		env.publishEvent({}, { currentDescribeBlock: "state2" });
		expect(currentTestState()).toBe("state2");
	});

	it("adjust test name pattern in regression mode", () => {
		const { env, config } = mockEnvironment({ mode: "regression" });

		const { originalTestNamePattern } = interceptTestState(env, config);

		const state = { testNamePattern: /test$/ };
		env.publishEvent({ name: "setup" }, state);
		expect(state.testNamePattern).toEqual(/test/);
		expect(originalTestNamePattern()).toEqual(/test$/);
	});

	it("do not adjust test name pattern in fuzzing mode", () => {
		const { env, config } = mockEnvironment({ mode: "fuzzing" });

		const interceptedTestState = interceptTestState(env, config);

		const state = { testNamePattern: /test$/ };
		env.publishEvent({ name: "setup" }, state);
		expect(state.testNamePattern).toEqual(/test$/);
		expect(interceptedTestState.originalTestNamePattern()).toBeUndefined();
	});

	it("mark all but the first fuzz test as skipped", () => {
		function eventWithTestName(name: string) {
			return {
				name: "test_start",
				test: {
					name: name,
					mode: "run",
					parent: {
						name: "ROOT DESCRIBE BLOCK",
					},
				},
			};
		}

		const { env, config, originalHandleTestEvent } = mockEnvironment({
			mode: "fuzzing",
		});

		interceptTestState(env, config);

		const state = { testNamePattern: /test$/ };
		env.publishEvent(eventWithTestName("1. test"), state);
		env.publishEvent(eventWithTestName("2. test"), state);
		env.publishEvent(eventWithTestName("3. test"), state);

		expect(originalHandleTestEvent).toHaveBeenCalledTimes(3);
		const firstEvent = originalHandleTestEvent.mock.calls[0][0];
		expect(firstEvent.test.mode).toBe("run");
		const secondEvent = originalHandleTestEvent.mock.calls[1][0];
		expect(secondEvent.test.mode).toBe("skip");
		const thirdEvent = originalHandleTestEvent.mock.calls[2][0];
		expect(thirdEvent.test.mode).toBe("skip");
	});

	it("deactivate Jest timeout in fuzzing mode", () => {
		const { env, config } = mockEnvironment({ mode: "fuzzing" });

		const { currentTestTimeout } = interceptTestState(env, config);

		env.publishEvent({ name: "test_fn_start" }, { testTimeout: 5000 });
		expect(currentTestTimeout()).toBeGreaterThan(5000);
	});
});

function mockEnvironment(options: Partial<Options> = {}) {
	const originalHandleTestEvent = jest.fn();
	const env = {
		handleTestEvent: originalHandleTestEvent,
		publishEvent: function (event: unknown, state: unknown) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this.handleTestEvent as any)(event, state);
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
	const config = {
		...defaultOptions,
		...options,
	};
	return { env, config, originalHandleTestEvent };
}
