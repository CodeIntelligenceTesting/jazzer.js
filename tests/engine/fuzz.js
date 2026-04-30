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

// Make the linter happy when we access Fuzzer.<stuff>
// Jazzer injects globalThis.Fuzzer at runtime.
/* global Fuzzer:readonly */

module.exports.fuzz = function (data) {
	if (data.length > 1024 * 1024) {
		throw new Error("Unexpectedly large input");
	}
};

module.exports.timeout_sync = function (_data) {
	while (true) {
		// Busy loop on purpose to exercise hard timeout handling.
	}
};

module.exports.timeout_async = function (_data) {
	return new Promise(() => {
		// Never resolve on purpose to exercise cooperative timeout handling.
	});
};

module.exports.regression = function (data) {
	if (data.toString() === "afl-regression-hit") {
		throw new Error("AFL regression finding");
	}
};

module.exports.guided_numeric = function (data) {
	if (data.length < 4) {
		return;
	}

	const value = data.readUInt32LE(0);
	if (Fuzzer.tracer.traceNumberCmp(value, 0x41424344, "===", 2001)) {
		throw new Error("AFL numeric guidance finding");
	}
};

module.exports.guided_equality = function (data) {
	const text = data.toString("utf8");
	Fuzzer.tracer.guideTowardsEquality(text, "libafl=eq", 2002);
	if (text === "libafl=eq") {
		throw new Error("AFL equality guidance finding");
	}
};

module.exports.guided_containment = function (data) {
	const text = data.toString("utf8");
	Fuzzer.tracer.guideTowardsContainment("afl-token", text, 2003);
	if (text.includes("afl-token")) {
		throw new Error("AFL containment guidance finding");
	}
};

module.exports.dictionary_target = function (data) {
	if (data.toString("utf8").includes("from-dictionary")) {
		throw new Error("AFL dictionary guidance finding");
	}
};
