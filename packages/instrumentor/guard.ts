/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

// Keep track of statements and expressions that should not be instrumented.
// This is necessary to avoid infinite recursion when instrumenting code.
export class InstrumentationGuard {
	private map: Map<string, Set<string>> = new Map();

	/**
	 * Add a tag and a value to the guard. This can be used to look up if the value.
	 * The value will be stringified internally before being added to the guard.
	 * @example instrumentationGuard.add("AssignmentExpression", node.left);
	 */
	add(tag: string, value: unknown) {
		if (!this.map.has(tag)) {
			this.map.set(tag, new Set());
		}
		this.map.get(tag)?.add(JSON.stringify(value));
	}

	/**
	 * Check if a value with a given tag exists in the guard. The value will be stringified internally before being checked.
	 * @example instrumentationGuard.has("AssignmentExpression", node.object);
	 */
	has(expression: string, value: unknown): boolean {
		return (
			(this.map.has(expression) &&
				this.map.get(expression)?.has(JSON.stringify(value))) ??
			false
		);
	}
}

export const instrumentationGuard = new InstrumentationGuard();
