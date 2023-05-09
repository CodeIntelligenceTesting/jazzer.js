/*
 * Copyright 2022 Code Intelligence GmbH
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

import { coverageTracker, CoverageTracker } from "./coverage";
import { tracer, Tracer } from "./trace";
import { addon } from "./addon";

export type {
	FuzzTarget,
	FuzzTargetAsyncOrValue,
	FuzzTargetCallback,
} from "./addon";

export interface Fuzzer {
	coverageTracker: CoverageTracker;
	tracer: Tracer;
	startFuzzing: typeof addon.startFuzzing;
	startFuzzingAsync: typeof addon.startFuzzingAsync;
	stopFuzzingAsync: typeof addon.stopFuzzingAsync;
	stopFuzzing: typeof addon.stopFuzzing;
}

export const fuzzer: Fuzzer = {
	coverageTracker: coverageTracker,
	tracer: tracer,
	startFuzzing: addon.startFuzzing,
	startFuzzingAsync: addon.startFuzzingAsync,
	stopFuzzingAsync: addon.stopFuzzingAsync,
	stopFuzzing: addon.stopFuzzing,
};

/**
 * Instructs the fuzzer to guide its mutations towards making `current` equal to `target`
 *
 * If the relation between the raw fuzzer input and the value of `current` is relatively
 * complex, running the fuzzer with the argument `-use_value_profile=1` may be necessary to
 * achieve equality.
 *
 * @param current a non-constant string observed during fuzz target execution
 * @param target a string that `current` should become equal to, but currently isn't
 * @param id a (probabilistically) unique identifier for this particular compare hint
 */
export function guideTowardsEquality(
	current: string,
	target: string,
	id: number
) {
	tracer.traceUnequalStrings(id, current, target);
}

/**
 * Instructs the fuzzer to guide its mutations towards making `haystack` contain `needle` as a substring.
 *
 * If the relation between the raw fuzzer input and the value of `haystack` is relatively
 * complex, running the fuzzer with the argument `-use_value_profile=1` may be necessary to
 * satisfy the substring check.
 *
 * @param needle a string that should be contained in `haystack` as a substring, but
 *     currently isn't
 * @param haystack a non-constant string observed during fuzz target execution
 * @param id a (probabilistically) unique identifier for this particular compare hint
 */
export function guideTowardsContainment(
	needle: string,
	haystack: string,
	id: number
) {
	tracer.traceStringContainment(id, needle, haystack);
}

/**
 * Instructs the fuzzer to attain as many possible values for the absolute value of `state`
 * as possible.
 *
 * Call this function from a fuzz target or a hook to help the fuzzer track partial progress
 * (e.g. by passing the length of a common prefix of two lists that should become equal) or
 * explore different values of state that is not directly related to code coverage.
 *
 * Note: This hint only takes effect if the fuzzer is run with the argument
 * `-use_value_profile=1`.
 *
 * @param state a numeric encoding of a state that should be varied by the fuzzer
 * @param id a (probabilistically) unique identifier for this particular state hint
 */
export function exploreState(state: number, id: number) {
	tracer.tracePcIndir(id, state);
}

export type { CoverageTracker } from "./coverage";
export type { Tracer } from "./trace";
