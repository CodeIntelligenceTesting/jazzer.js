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

import { types } from "@babel/core";
import { NumericLiteral } from "@babel/types";

// xorshift32 PRNG for deterministic compare-hook TORC slot assignments.
// Seeded once at startup so that a given -seed= value produces identical
// mutation schedules across runs.
let state = 0xdead_beef;

export function setSeed(seed: number): void {
	state = seed | 1; // xorshift requires non-zero state
}

export function fakePC(): NumericLiteral {
	state ^= state << 13;
	state ^= state >> 17;
	state ^= state << 5;
	return types.numericLiteral((state >>> 0) % 512);
}
