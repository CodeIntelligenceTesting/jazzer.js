/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

// User-facing API
export function getBugDetectorConfiguration(bugDetector: string): unknown {
	return bugDetectorConfigurations.get(bugDetector);
}

class BugDetectorConfigurations {
	// eslint-disable-next-line  @typescript-eslint/no-explicit-any
	configurations = new Map<string, any>();

	// eslint-disable-next-line  @typescript-eslint/no-explicit-any
	set(bugDetector: string, configuration: any): void {
		this.configurations.set(bugDetector, configuration);
	}

	// eslint-disable-next-line  @typescript-eslint/no-explicit-any
	get(bugDetector: string): any {
		return this.configurations.get(bugDetector);
	}
}

export const bugDetectorConfigurations = new BugDetectorConfigurations();
