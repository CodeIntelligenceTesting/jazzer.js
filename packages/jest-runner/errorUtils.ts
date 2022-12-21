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

export const cleanupJestRunner = (
	stack: string | undefined
): string | undefined => {
	if (!stack) {
		return stack;
	}
	let foundFirstJestRunnerFrame = false;
	const newStack = stack
		.split("\n")
		.filter((frame) => {
			if (frame.indexOf("jest-runner") != -1) {
				foundFirstJestRunnerFrame = true;
			}
			return !foundFirstJestRunnerFrame;
		})
		.join("\n");
	return stack.endsWith("\n") ? newStack + "\n" : newStack;
};

export const removeTopFrames = (
	stack: string | undefined,
	drop: number
): string | undefined => {
	if (!stack) {
		return stack;
	}
	const frames = stack.split("\n");
	frames.splice(1, drop);
	return frames.join("\n");
};

export const removeBottomFrames = (
	stack: string | undefined,
	drop: number
): string | undefined => {
	if (!stack) {
		return stack;
	}
	const frames = stack.split("\n");
	frames.splice(frames.length - drop - 1);
	const newStack = frames.join("\n");
	return stack.endsWith("\n") ? newStack + "\n" : newStack;
};
