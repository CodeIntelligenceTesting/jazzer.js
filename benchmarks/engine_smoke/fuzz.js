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

const qs = require("qs");

const { FuzzedDataProvider } = require("@jazzer.js/core");

module.exports.fuzz = function (data) {
	const provider = new FuzzedDataProvider(data);
	const input = provider.consumeRemainingAsString();

	const parseOptions = {
		allowDots: provider.consumeBoolean(),
		allowEmptyArrays: provider.consumeBoolean(),
		allowPrototypes: provider.consumeBoolean(),
		arrayLimit: provider.consumeIntegralInRange(0, 32),
		charset: provider.pickValue(["utf-8", "iso-8859-1"]),
		charsetSentinel: provider.consumeBoolean(),
		comma: provider.consumeBoolean(),
		decodeDotInKeys: provider.consumeBoolean(),
		depth: provider.consumeIntegralInRange(0, 16),
		duplicates: provider.pickValue(["combine", "first", "last"]),
		ignoreQueryPrefix: provider.consumeBoolean(),
		interpretNumericEntities: provider.consumeBoolean(),
		parameterLimit: provider.consumeIntegralInRange(1, 256),
		parseArrays: provider.consumeBoolean(),
		plainObjects: provider.consumeBoolean(),
		strictDepth: provider.consumeBoolean(),
		strictNullHandling: provider.consumeBoolean(),
	};

	let parsed;
	try {
		parsed = qs.parse(input, parseOptions);
	} catch {
		return;
	}

	try {
		qs.stringify(parsed, {
			addQueryPrefix: provider.consumeBoolean(),
			allowDots: provider.consumeBoolean(),
			allowEmptyArrays: provider.consumeBoolean(),
			arrayFormat: provider.pickValue([
				"indices",
				"brackets",
				"repeat",
				"comma",
			]),
			charset: provider.pickValue(["utf-8", "iso-8859-1"]),
			charsetSentinel: provider.consumeBoolean(),
			commaRoundTrip: provider.consumeBoolean(),
			delimiter: provider.pickValue(["&", ";"]),
			encode: provider.consumeBoolean(),
			encodeDotInKeys: provider.consumeBoolean(),
			indices: provider.consumeBoolean(),
			skipNulls: provider.consumeBoolean(),
			strictNullHandling: provider.consumeBoolean(),
		});
	} catch {
		// Smoke target: ignore library-level parse/stringify failures.
	}
};
