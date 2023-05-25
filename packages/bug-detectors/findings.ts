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
 *
 */

export class Finding extends Error {}

// The first finding found by any bug detector will be saved here.
// This is a global variable shared between the core-library (read, reset) and the bug detectors (write).
// It is cleared every time when the fuzzer is finished processing an input (only relevant for modes where the fuzzing
// continues after finding an error, e.g. fork mode, Jest regression mode, fuzzing that ignores errors mode, etc.).
let firstFinding: Finding | undefined;

export function getFirstFinding(): Finding | undefined {
	return firstFinding;
}

// Clear the finding saved by the bug detector before the fuzzer continues with a new input.
export function clearFirstFinding(): void {
	firstFinding = undefined;
}

/**
 * Saves the first finding found by any bug detector and throws it.
 *
 * @param findingMessage - The finding to be saved and thrown.
 */
export function reportFinding(findingMessage: string): void {
	// After saving the first finding, ignore all subsequent errors.
	if (firstFinding) {
		return;
	}
	firstFinding = new Finding(findingMessage);
	throw firstFinding;
}
