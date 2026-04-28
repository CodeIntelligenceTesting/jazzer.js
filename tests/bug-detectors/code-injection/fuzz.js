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

// --- eval / Function: should report potential access by default ---

module.exports.evalAccessesCanary = function (_data) {
	eval("jaz_zer()");
};

module.exports.evalIndirectAccessesCanary = function (_data) {
	const indirectEval = eval;
	indirectEval("jaz_zer()");
};

module.exports.evalCommaOperatorAccessesCanary = function (_data) {
	(0, eval)("jaz_zer()");
};

module.exports.evalOptionalChainingAccessesCanary = function (_data) {
	eval?.("jaz_zer()");
};

module.exports.heuristicReadAccessesCanary = function (_data) {
	const propertyName = "jaz_zer";
	void globalThis[propertyName];
	console.log("can be called just fine");
};

module.exports.functionAccessesCanary = function (_data) {
	Function("jaz_zer()")();
};

module.exports.functionNewAccessesCanary = function (_data) {
	new Function("jaz_zer()")();
};

module.exports.functionWithArgAccessesCanary = function (_data) {
	new Function("value", "jaz_zer()")("_");
};

module.exports.functionStringCoercibleAccessesCanary = function (_data) {
	const body = { toString: () => "jaz_zer()" };
	Function(body)();
};

module.exports.functionCoercesOnce = function (_data) {
	let toStringCalls = 0;
	const body = {
		toString: () => {
			toStringCalls += 1;
			return toStringCalls === 1
				? "console.log('can be called just fine')"
				: "throw new Error('Function body was coerced twice')";
		},
	};
	Function(body)();
};

// --- eval / Function: should not trigger ---

module.exports.evalSafeCode = function (_data) {
	eval("const a = 10; const b = 20; console.log('can be called just fine')");
};

module.exports.evalTargetInStringLiteral = function (_data) {
	eval("const x = 'jaz_zer'; console.log('can be called just fine')");
};

module.exports.functionSafeCode = function (_data) {
	Function("console.log('can be called just fine')")();
};

module.exports.functionSafeCodeNew = function (_data) {
	new Function("console.log('can be called just fine')")();
};

module.exports.functionTargetInArgName = function (_data) {
	new Function("jaz_zer", "console.log('can be called just fine')")("_");
};

module.exports.functionTargetInStringLiteral = function (_data) {
	new Function("const x = 'jaz_zer'; console.log('can be called just fine')")();
};

module.exports.functionStringCoercibleSafe = function (_data) {
	const body = {
		toString: () => "console.log('can be called just fine')",
	};
	Function(body)();
};

module.exports.functionPrototypeExists = function (_data) {
	console.log(Function.prototype.call.bind);
};
