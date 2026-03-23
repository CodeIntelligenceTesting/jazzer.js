/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

module.exports.BaseObjectPollution = function (data) {
	const a = {};
	a.__proto__.polluted = true;
};

module.exports.BaseObjectPollutionWithSquareBraces = function (data) {
	const a = {};
	a["__proto__"]["polluted"] = true;
};

module.exports.ArrayObjectPollution = function (data) {
	const a = [];
	a.__proto__.polluted = true;
};

module.exports.FunctionObjectPollution = function (data) {
	const a = function () {
		/* empty */
	};
	Function.__proto__.polluted = () => {
		console.error(
			"This is printed when the prototype of Function is polluted.",
		);
	};
	const c = () => {
		/* empty */
	};
	c.polluted();
};

module.exports.StringObjectPollution = function (data) {
	const a = "a";
	a.__proto__.polluted = true;
};

module.exports.NumberObjectPollution = function (data) {
	const a = 1000;
	a.__proto__.polluted = true;
};

module.exports.BooleanObjectPollution = function (data) {
	const a = false;
	a.__proto__.polluted = true;
};

module.exports.ConstructorPrototype = function (data) {
	const a = Object.create({});
	a.constructor.prototype.polluted = true;
};

module.exports.LocalPrototypePollution = function (data) {
	const a = { __proto__: "test" };
	a.__proto__.polluted = true;
};

module.exports.PollutingAClass = function (data) {
	class A {}
	class B extends A {}
	const b = new B();
	b.__proto__.polluted = true;
};

module.exports.ChangedToString = function (data) {
	const a = { __proto__: "test" };
	a.__proto__.toString = () => {
		return "test";
	};
	console.error(Object.getPrototypeOf(a));
};

module.exports.DeletedToString = function (data) {
	const a = { __proto__: "test" };
	delete a.__proto__.toString;
};

module.exports.DictionaryTest = function (data) {
	/* empty */
};

module.exports.TwoStagePollutionWithObjectCreation = function (data) {
	class A {}
	const a = new A();
	const b = a["__proto__"];
	b.polluted = true;
	const c = new A(); // If we make a new object, PP will be detected.
	console.error(c.polluted);
};

// Current instrumentation does not detect this. This test is currently unused.
module.exports.TwoStagePollution = function (data) {
	class A {}
	const a = new A();
	const b = a["__proto__"];
	b.polluted = true; // This can currently not be detected.
};

module.exports.AsyncAssignment = async function (data) {
	const fn = async () => {
		return { __proto__: { polluted: true } };
	};
	let a;
	a = await fn();
};

module.exports.AsyncVariableDeclaration = async function (data) {
	const fn = async () => {
		return { __proto__: { polluted: true } };
	};
	const a = await fn();
};

module.exports.EqualExpressionInstrumentation = function (data) {
	const makeStatefulFn = () => {
		let i = -1;
		return () => {
			i++;
			if (i === 1) {
				return { __proto__: { polluted: true } };
			} else {
				return {};
			}
		};
	};
	const fn = makeStatefulFn();
	let a;
	// PP instrumentation adds the next line to the instrumentation guard.
	a = fn();
	// If the next line is not instrumented, prototype pollution will not be detected.
	a = fn();
};

module.exports.EqualVariableDeclarationsInstrumentation = function (data) {
	const makeStatefulFn = () => {
		let i = -1;
		return () => {
			i++;
			if (i === 1) {
				return { __proto__: { polluted: true } };
			} else {
				return {};
			}
		};
	};
	const fn = makeStatefulFn();

	const a = fn();

	(() => {
		const a = fn();
	})();
};
