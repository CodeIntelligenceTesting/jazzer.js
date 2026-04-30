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
