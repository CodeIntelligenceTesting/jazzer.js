/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
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
