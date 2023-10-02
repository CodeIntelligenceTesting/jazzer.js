/*
 * Copyright 2023 Code Intelligence GmbH
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

const printOkMessage = "console.log('can be called just fine')";

// eval
module.exports.invocationWithoutError = function (data) {
	eval("const a = 10; const b = 20;" + printOkMessage);
};

module.exports.directInvocation = function (data) {
	eval("const jaz_zer = 10;");
};

module.exports.indirectInvocation = function (data) {
	const a = eval;
	a("const jaz_zer = 10;");
};

module.exports.indirectInvocationUsingCommaOperator = function (data) {
	(0, eval)("const jaz_zer = 10;");
};

module.exports.indirectInvocationThroughOptionalChaining = function (data) {
	eval?.("const jaz_zer = 10;");
};

// Function
module.exports.functionNoErrorNoConstructor = function (data) {
	Function("const a = 10; const b = 20;" + printOkMessage)();
};

module.exports.functionNoErrorWithConstructor = function (data) {
	const fn = new Function("const a = 10; const b = 20;" + printOkMessage);
	fn();
};

module.exports.functionError = function (data) {
	Function("const jaz_zer = 10;");
};

module.exports.functionErrorNew = function (data) {
	new Function("const jaz_zer = 10;")();
};

module.exports.functionWithArgNoError = function (data) {
	new Function(
		"jaz_zer",
		"const foo = 10; console.log('Function can be called just fine')",
	)("_");
};

module.exports.functionWithArgError = function (data) {
	new Function("foo", "const jaz_zer = 10;")("_");
};
