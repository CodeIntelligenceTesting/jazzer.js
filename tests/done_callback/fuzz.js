/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

/**
 * @param { Buffer } data
 * @param { Function } done
 */
module.exports.fuzz = function (data, done) {
	if (data.length < 3) {
		done();
		return;
	}
	setTimeout(() => {
		let one = data.readInt8(0);
		let two = data.readInt8(1);
		let three = data.readInt8(2);
		if (one + two + three === 42) {
			done(new Error(`${one} + ${two} + ${three} = 42`));
		} else {
			done();
		}
	}, 10);
};
