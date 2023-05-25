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

import * as findings from "./findings";
import * as fs from "fs";
import * as path from "path";
export { getBugDetectorConfiguration } from "./configuration";

// Export user-facing API for writing custom bug detectors.
export {
	reportFinding,
	getFirstFinding,
	clearFirstFinding,
	Finding,
} from "./findings";

// Global API for bug detectors that can be used by instrumentation plugins.
export interface BugDetectors {
	reportFinding: typeof findings.reportFinding;
}

export const bugDetectors: BugDetectors = {
	reportFinding: findings.reportFinding,
};

// Filters out disabled bug detectors and prepares all the others for dynamic import.
export function getFilteredBugDetectorPaths(
	bugDetectorsDirectory: string,
	disableBugDetectors: string[],
): string[] {
	const disablePatterns = disableBugDetectors.map(
		(pattern: string) => new RegExp(pattern),
	);
	return (
		fs
			.readdirSync(bugDetectorsDirectory)
			// The compiled "internal" directory contains several files such as .js.map and .d.ts.
			// We only need the .js files.
			// Here we also filter out bug detectors that should be disabled.
			.filter((bugDetectorPath) => {
				if (!bugDetectorPath.endsWith(".js")) {
					return false;
				}

				// Dynamic imports need .js files.
				const bugDetectorName = path.basename(bugDetectorPath, ".js");

				// Checks in the global options if the bug detector should be loaded.
				const shouldDisable = disablePatterns.some((pattern) =>
					pattern.test(bugDetectorName),
				);

				if (shouldDisable) {
					console.log(
						`Skip loading bug detector "${bugDetectorName}" because of user-provided pattern.`,
					);
				}
				return !shouldDisable;
			})
			// Get absolute paths for each bug detector.
			.map((file) => path.join(bugDetectorsDirectory, file))
	);
}
