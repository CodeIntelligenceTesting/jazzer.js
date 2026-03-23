/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

export const cleanupJestError = (error: unknown): unknown => {
	if (error == undefined) {
		return undefined;
	}
	if (error instanceof Error) {
		error.stack = cleanupJestRunnerStack(error.stack);
	}
	return error;
};

export const cleanupJestRunnerStack = (stack?: string): string | undefined => {
	function isStackFrame(frame: string) {
		return frame.indexOf("  at ") !== -1;
	}
	function isRunnerFrame(frame: string) {
		return (
			frame.indexOf("jest-runner") !== -1 || frame.indexOf("jest-circus") !== -1
		);
	}
	if (!stack) {
		return stack;
	}
	let foundFirstNoneRunnerFrame = false;
	const newStack = stack
		.split("\n")
		.filter((frame) => {
			if (!isStackFrame(frame)) {
				return true;
			}
			if (foundFirstNoneRunnerFrame || !isRunnerFrame(frame)) {
				foundFirstNoneRunnerFrame = true;
			}
			return foundFirstNoneRunnerFrame;
		})
		.join("\n");
	return stack.endsWith("\n") ? newStack + "\n" : newStack;
};

export const removeTopFramesFromError = (
	error: Error | undefined,
	drop: number,
): Error | undefined => {
	if (error == undefined) {
		return error;
	}
	error.stack = removeTopFrames(error.stack, drop);
	return error;
};

export const removeTopFrames = (
	stack: string | undefined,
	drop: number,
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
	drop: number,
): string | undefined => {
	if (!stack) {
		return stack;
	}
	const frames = stack.split("\n");
	frames.splice(frames.length - drop - 1);
	const newStack = frames.join("\n");
	return stack.endsWith("\n") ? newStack + "\n" : newStack;
};
