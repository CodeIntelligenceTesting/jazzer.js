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

const BASE_CANARY_NAME = "jaz_zer";

export type CanaryTarget = {
	label: string;
	object: object | undefined;
};

type DescriptorFactory = (canaryName: string) => PropertyDescriptor;
type CanaryCache = WeakMap<object, string>;

export function ensureCanary(
	targets: CanaryTarget[],
	cache: CanaryCache,
	createDescriptor: DescriptorFactory,
): string {
	const failures: string[] = [];

	for (const target of targets) {
		if (!target.object) {
			continue;
		}

		try {
			return ensureTargetCanary(target.object, cache, createDescriptor);
		} catch (error) {
			failures.push(`${target.label}: ${describeError(error)}`);
		}
	}

	// This can happen if the carary target object is locked down
	throw new Error(buildNoCanaryTargetMessage(failures));
}

function ensureTargetCanary(
	target: object,
	cache: CanaryCache,
	createDescriptor: DescriptorFactory,
): string {
	const knownCanaryName = cache.get(target);
	if (knownCanaryName) {
		return knownCanaryName;
	}

	const canaryName = nextCanaryName(target);
	Object.defineProperty(target, canaryName, createDescriptor(canaryName));
	cache.set(target, canaryName);
	return canaryName;
}

function nextCanaryName(target: object): string {
	let canaryName = BASE_CANARY_NAME;
	let suffix = 0;
	while (Object.getOwnPropertyDescriptor(target, canaryName)) {
		suffix += 1;
		canaryName = `${BASE_CANARY_NAME}_${suffix}`;
	}
	return canaryName;
}

function buildNoCanaryTargetMessage(failures: string[]): string {
	const lines = [
		"The Code Injection bug detector could not install a canary on any available global object.",
		"Disable it explicitly with --disableBugDetectors=code-injection or the equivalent Jest configuration if your environment intentionally locks down globals.",
	];

	if (failures.length > 0) {
		lines.push("", "Installation failures:");
		lines.push(...failures.map((failure) => `    ${failure}`));
	}

	return lines.join("\n");
}

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	if (typeof error === "string") {
		return error;
	}
	return String(error);
}
