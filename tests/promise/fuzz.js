/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

let lastInvocationCount = 0;
let invocationCount = lastInvocationCount + 1;

/**
 * @param { Buffer } data
 */
module.exports.fuzz_promise = function (data) {
	return new Promise((resolve, reject) => {
		if (data.length < 3) {
			resolve(invocationCount++);
			return;
		}
		setTimeout(() => {
			let one = data.readInt8(0);
			let two = data.readInt8(1);
			let three = data.readInt8(2);
			if (one + two + three === 42) {
				reject(
					new Error(
						`${one} + ${two} + ${three} = 42 (invocation ${invocationCount})`,
					),
				);
			} else {
				resolve(invocationCount++);
			}
		}, 10);
	}).then((value) => {
		if (value !== lastInvocationCount + 1) {
			throw new Error(
				`Invalid invocation order, received ${value} but last invocation was ${lastInvocationCount}.`,
			);
		}
		lastInvocationCount = value;
	});
};
