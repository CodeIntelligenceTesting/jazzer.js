/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

function foo(a) {
	console.log("original foo");
	if (a > 10) {
		return 5;
	}
	return 42;
}

module.exports = {
	foo,
};
