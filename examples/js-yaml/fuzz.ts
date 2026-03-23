/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import yaml, { YAMLException } from "js-yaml";

export function fuzz(data: Buffer) {
	try {
		yaml.load(data.toString());
	} catch (e: unknown) {
		if (typeof e !== "object" || (e as Error).name !== YAMLException.name) {
			throw e;
		}
	}
}
