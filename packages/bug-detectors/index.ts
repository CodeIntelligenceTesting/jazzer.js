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

// Export user-facing API for writing custom bug detectors.
export {
	reportFinding,
	getFirstFinding,
	clearFirstFinding,
	Finding,
} from "./findings";

// Checks in the global options if the bug detector should be loaded.
function shouldDisableBugDetector(
	disableBugDetectors: RegExp[],
	bugDetectorName: string,
): boolean {
	// pattern match for bugDetectorName in disableBugDetectors
	for (const pattern of disableBugDetectors) {
		if (pattern.test(bugDetectorName)) {
			if (process.env.JAZZER_DEBUG)
				console.log(
					`Skip loading bug detector ${bugDetectorName} because it matches ${pattern}`,
				);
			return true;
		}
	}
	return false;
}

export async function loadBugDetectors(
	disableBugDetectors: RegExp[],
): Promise<void> {
	// Dynamic imports require either absolute path, or a relative path with .js extension.
	// This is ok, since our .ts files are compiled to .js files.
	if (!shouldDisableBugDetector(disableBugDetectors, "command-injection")) {
		await import("./internal/command-injection.js");
	}
	if (!shouldDisableBugDetector(disableBugDetectors, "path-traversal")) {
		await import("./internal/path-traversal.js");
	}
}
