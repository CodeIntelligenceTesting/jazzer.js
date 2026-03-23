/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

module.exports.OnePlusOne = function (data) {
	let a = 10;
	let b = 20;
	let c = a + b;
	a = a + 1;
	b = a = 1 + 10;
	expect(a).toBe(11);
	expect(b).toBe(11);
	expect(c).toBe(30);
};

module.exports.LambdaAssignmentAndExecution = function (data) {
	let a;
	a = ((n) => {
		return n + 1;
	})(10);
	expect(a).toBe(11);
};

module.exports.LambdaAssignmentAndExecutionLater = function (data) {
	let a;
	a = (n) => {
		return n + 1;
	};
	expect(a(10)).toBe(11);
};

module.exports.LambdaVariableDeclaration = function (data) {
	const a = (n) => {
		return n + 1;
	};
	expect(a(10)).toBe(11);
};

function expect(value) {
	return {
		toBe: function (expected) {
			if (value !== expected) {
				throw new Error(`Expected ${expected} but got ${value}`);
			}
		},
	};
}
