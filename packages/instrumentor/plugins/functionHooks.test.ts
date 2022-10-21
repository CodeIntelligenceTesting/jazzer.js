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

/* eslint @typescript-eslint/no-unused-vars: 0 */
/* eslint @typescript-eslint/no-empty-function: 0 */

import { instrumentAndEvalWith } from "./testhelpers";
import { functionHooks } from "./functionHooks";
import * as hooking from "@jazzer.js/hooking";

const expectInstrumentationEval = instrumentAndEvalWith(
	functionHooks("pkg/lib/a")
);

registerHookManagerGlobally();

describe("function hooks instrumentation", () => {
	describe("Before hooks", () => {
		it("one Before hook called before function", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const output = `
			|function foo(arg1, arg2) {
			|  HookManager.callHook(0, this, [arg1, arg2]);
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
		it("two Before hooks called before function", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				2,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const output = `
			|function foo(arg1, arg2) {
			|  HookManager.callHook(0, this, [arg1, arg2]);
			|  HookManager.callHook(1, this, [arg1, arg2]);
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(2);
			expect(hookCallMap.get(0)).toEqual(1);
			expect(hookCallMap.get(1)).toEqual(1);
		});
		it("one Before hook called before a function expression", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2]
			);
			const input = `
			|const foo = function (arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const output = `
			|const foo = function (arg1, arg2) {
			|  HookManager.callHook(0, this, [arg1, arg2]);
			|  return arg1 + arg2;
			|};
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
		it("one Before hook called before a class method", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerMethodHook(
				"A.foo",
				hooking.HookType.Before,
				1,
				[2]
			);
			const input = `
			|class A {
			|  constructor(a) {
			|    this.a = a;
			|  }
			|
			|  foo(x) {
			|    return this.a + x;
			|  }
			| 
			|  bar() {
			|    return this.a + 1; 
			|  }
			|}
			|
			|const foo = function (arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|const a = new A(1);
			|a.foo(2);`;
			const output = `
			|class A {
			|  constructor(a) {
			|    this.a = a;
			|  }
			|
			|  foo(x) {
			|    HookManager.callHook(0, this, [x]);
			|    return this.a + x;
			|  }
			|
			|  bar() {
			|    return this.a + 1;
			|  }
			|
			|}
			|
			|const foo = function (arg1, arg2) {
			|  return arg1 + arg2;
			|};
			|
			|const a = new A(1);
			|a.foo(2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
		it("one Before hook called before an method in a class expression", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerMethodHook(
				"A.foo",
				hooking.HookType.Before,
				1,
				[2]
			);
			const input = `
			|const A = class {
			|  constructor(a) {
			|    this.a = a;
			|  }
			|
			|  foo(x) {
			|    return this.a + x;
			|  }
			| 
			|  bar() {
			|    return this.a + 1; 
			|  }
			|}
			|
			|const foo = function (arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|const a = new A(1);
			|a.foo(2);`;
			const output = `
			|const A = class {
			|  constructor(a) {
			|    this.a = a;
			|  }
			|
			|  foo(x) {
			|    HookManager.callHook(0, this, [x]);
			|    return this.a + x;
			|  }
			|
			|  bar() {
			|    return this.a + 1;
			|  }
			|
			|};
			|
			|const foo = function (arg1, arg2) {
			|  return arg1 + arg2;
			|};
			|
			|const a = new A(1);
			|a.foo(2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
		it("one Before hook called before an object method with assignment", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerMethodHook(
				"A.foo",
				hooking.HookType.Before,
				1,
				[2]
			);
			const input = `
			|const A = {
			|  a: 1
			|};
			|
			|A.foo = function (x) {
			|  return this.a + x;
			|};
			|
			|A.bar = function () {
			|  return this.a + 1;
			|};
			|
			|A.foo(2);`;
			const output = `
			|const A = {
			|  a: 1
			|};
			|
			|A.foo = function (x) {
			|  HookManager.callHook(0, this, [x]);
			|  return this.a + x;
			|};
			|
			|A.bar = function () {
			|  return this.a + 1;
			|};
			|
			|A.foo(2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
		it("one Before hook called before an object method as property", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerMethodHook(
				"obj.foo",
				hooking.HookType.Before,
				1,
				[2]
			);
			const input = `
			|const obj = {
			|  a: 1,
			|  foo: function (x) {
			|    return this.a + x;
			|  }
			|};
			|
			|
			|obj.bar = function () {
			|  return this.a + 1;
			|};
			|
			|obj.foo(2);`;
			const output = `
			|const obj = {
			|  a: 1,
			|  foo: function (x) {
			|    HookManager.callHook(0, this, [x]);
			|    return this.a + x;
			|  }
			|};
			|
			|obj.bar = function () {
			|  return this.a + 1;
			|};
			|
			|obj.foo(2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
		it("one Before hook called before a nested function", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerSyncFunctionHook(
				"foo.bar",
				hooking.HookType.Before,
				1,
				[2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  function bar(x) {
			|    return x + 1;
			|  }
			|  return arg1 + bar(arg2);
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const output = `
			|function foo(arg1, arg2) {
			|  function bar(x) {
			|    HookManager.callHook(0, this, [x]);
			|    return x + 1;
			|  }
			|
			|  return arg1 + bar(arg2);
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(4);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
	});
	describe("After hooks", () => {
		it("one hook called after a sync function", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2)`;
			const output = `
			|function foo(arg1, arg2) {
			|  const foo_original = (arg1, arg2) => {
			|    return arg1 + arg2;
			|  };
			|
			|  const foo_original_result = foo_original.call(this, arg1, arg2);
			|  HookManager.callHook(0, this, [arg1, arg2], foo_original_result);
			|  return foo_original_result;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
		it("two hooks called after a sync function", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.After,
				2,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2)`;
			const output = `
			|function foo(arg1, arg2) {
			|  const foo_original = (arg1, arg2) => {
			|    return arg1 + arg2;
			|  };
			|
			|  const foo_original_result = foo_original.call(this, arg1, arg2);
			|  HookManager.callHook(0, this, [arg1, arg2], foo_original_result);
			|  HookManager.callHook(1, this, [arg1, arg2], foo_original_result);
			|  return foo_original_result;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(2);
			expect(hookCallMap.get(0)).toEqual(1);
			expect(hookCallMap.get(1)).toEqual(1);
		});

		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		it("one hook called after an async function", (): any => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerAsyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return new Promise((resolve, reject) => {
			|    resolve(arg1 + arg2);
			|  });
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const output = `
			|function foo(arg1, arg2) {
			|  const foo_original = (arg1, arg2) => {
			|    return new Promise((resolve, reject) => {
			|      resolve(arg1 + arg2);
			|    });
			|  };
			|
			|  return foo_original.call(this, arg1, arg2).then(function (foo_original_result) {
			|    HookManager.callHook(0, this, [arg1, arg2], foo_original_result);
			|    return foo_original_result;
			|  });
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			return expectInstrumentationEval<Promise<number>>(input, output)?.then(
				(result: number) => {
					expect(result).toEqual(3);
					expect(hookCallMap.size).toEqual(1);
					expect(hookCallMap.get(0)).toEqual(1);
				}
			);
		});

		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		it("two hooks called after an async function", (): any => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerAsyncFunctionHook(
				"foo",
				hooking.HookType.After,
				2,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return new Promise((resolve, reject) => {
			|    resolve(arg1 + arg2);
			|  });
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2)`;
			const output = `
			|function foo(arg1, arg2) {
			|  const foo_original = (arg1, arg2) => {
			|    return new Promise((resolve, reject) => {
			|      resolve(arg1 + arg2);
			|    });
			|  };
			|
			|  return foo_original.call(this, arg1, arg2).then(function (foo_original_result) {
			|    HookManager.callHook(0, this, [arg1, arg2], foo_original_result);
			|    return foo_original_result;
			|  }).then(function (foo_original_result) {
			|    HookManager.callHook(1, this, [arg1, arg2], foo_original_result);
			|    return foo_original_result;
			|  });
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			return expectInstrumentationEval<Promise<number>>(input, output)?.then(
				(result: number) => {
					expect(result).toEqual(3);
					expect(hookCallMap.size).toEqual(2);
					expect(hookCallMap.get(0)).toEqual(1);
					expect(hookCallMap.get(0)).toEqual(1);
				}
			);
		});
	});
	describe("Replace hooks", () => {
		it("one hook called instead of the original function", () => {
			hooking.hookManager.clearHooks();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Replace,
				1,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const output = `
			|function foo(arg1, arg2) {
			|  const foo_original = (arg1, arg2) => {
			|    return arg1 + arg2;
			|  };
			|
			|  return HookManager.callHook(0, this, [arg1, arg2], foo_original);
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.get(0)).toEqual(1);
		});
	});
	describe("Before and After hooks", () => {
		it("one Before and ond After hook for a sync function", function () {
			hooking.hookManager.clearHooks();
			const beforeHookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2]
			);
			const afterHookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2)`;
			const output = `
			|function foo(arg1, arg2) {
			|  HookManager.callHook(0, this, [arg1, arg2]);
			|
			|  const foo_original = (arg1, arg2) => {
			|    return arg1 + arg2;
			|  };
			|
			|  const foo_original_result = foo_original.call(this, arg1, arg2);
			|  HookManager.callHook(1, this, [arg1, arg2], foo_original_result);
			|  return foo_original_result;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			expect(beforeHookCallMap.size).toEqual(1);
			expect(beforeHookCallMap.get(0)).toEqual(1);
			expect(afterHookCallMap.size).toEqual(1);
			expect(afterHookCallMap.get(0)).toEqual(1);
		});
		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		it("one Before and ond After hook for an async function", (): any => {
			hooking.hookManager.clearHooks();
			const beforeHookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2]
			);
			const afterHookCallMap = registerAsyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2]
			);
			const input = `
			|function foo(arg1, arg2) {
			|  return new Promise((resolve, reject) => {
			|    resolve(arg1 + arg2);
			|  });
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const output = `
			|function foo(arg1, arg2) {
			|  HookManager.callHook(0, this, [arg1, arg2]);
			|
			|  const foo_original = (arg1, arg2) => {
			|    return new Promise((resolve, reject) => {
			|      resolve(arg1 + arg2);
			|    });
			|  };
			|
			|  return foo_original.call(this, arg1, arg2).then(function (foo_original_result) {
			|    HookManager.callHook(1, this, [arg1, arg2], foo_original_result);
			|    return foo_original_result;
			|  });
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			return expectInstrumentationEval<Promise<number>>(input, output)?.then(
				(result: number) => {
					expect(result).toEqual(3);
					expect(beforeHookCallMap.size).toEqual(1);
					expect(beforeHookCallMap.get(0)).toEqual(1);
					expect(afterHookCallMap.size).toEqual(1);
					expect(afterHookCallMap.get(0)).toEqual(1);
				}
			);
		});
	});
});

function registerHookManagerGlobally() {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	global.HookManager = hooking.hookManager;
}

function registerSyncFunctionHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[]
) {
	return registerHook(target, hookType, numHooks, expectedParams, false, false);
}
function registerAsyncFunctionHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[]
) {
	return registerHook(target, hookType, numHooks, expectedParams, false, true);
}
function registerMethodHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[]
) {
	return registerHook(target, hookType, numHooks, expectedParams, true, false);
}

function registerHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[],
	isMethod: boolean,
	isAsync: boolean
) {
	const hookCallMap = new Map<number, number>();
	for (let i = 0; i < numHooks; i++) {
		hooking.hookManager.registerHook(
			hookType,
			target,
			"pkg",
			isAsync,
			// eslint-disable-next-line @typescript-eslint/ban-types
			(
				thisPtr: unknown,
				params: number[],
				hookId: number,
				// eslint-disable-next-line @typescript-eslint/ban-types
				originalFunction: Function
			) => {
				hookCallMap.set(i, (hookCallMap.get(i) ?? 0) + 1);
				if (isMethod) {
					expect(thisPtr).toBeDefined();
				} else {
					expect(thisPtr).toBeUndefined();
				}
				expect(params.length).toEqual(expectedParams.length);
				for (let j = 0; j < params.length; j++) {
					expect(params[j]).toEqual(expectedParams[j]);
				}
				if (hookType === hooking.HookType.Replace) {
					return originalFunction.call(thisPtr, ...params);
				}
			}
		);
	}
	return hookCallMap;
}
