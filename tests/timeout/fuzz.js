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

/**
 * This is a regression test that checks that running this function with "--timeout=1000" does not result in a timeout.
 *
 * @param { Buffer } data
 */
module.exports.fuzz = function (data) {
	if (data.length < 8) {
		return;
	}
};

/**
 * Timeouts are directly handled by libFuzzer and can not be intercepted.
 * Due to this, the example is not executed during the test phase.
 *
 * @param { Buffer } data
 */
module.exports.timeout = function (data) {
	return new Promise((resolve) => {
		if (data.length <= 10) {
			resolve();
		}
		// else never resolve the promise
	});
};
