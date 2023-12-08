/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

/**
 * @param {number} n
 */
function encrypt(n) {
	return n ^ 0x11223344;
}

/**
 * @param { Buffer } data
 */
module.exports.fuzz = function (data) {
	if (data.length < 16) {
		return;
	}
	if (
		encrypt(data.readInt32BE(0)) === 0x50555637 &&
		encrypt(data.readInt32BE(4)) === 0x7e4f5664
	) {
		throw Error("XOR with a constant is not a secure encryption method ;-)");
	}
};
