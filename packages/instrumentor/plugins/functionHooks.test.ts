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

import { instrumentAndEvalWith } from "./testhelpers";
import { functionHooks } from "./functionHooks";
import * as hooking from "@jazzer.js/hooking";
import { Hook, TrackedHook, hookTracker } from "@jazzer.js/hooking";

const expectInstrumentationEval = instrumentAndEvalWith(
	functionHooks("pkg/lib/a"),
);

registerHookManagerGlobally();

describe("function hooks instrumentation", () => {
	describe("Before hooks", () => {
		it("one Before hook called before function", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Before", "foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo"]);
			expectTrackedHooks(hookTracker.available, ["bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one Before hook not called when not applicable", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"baz",
				hooking.HookType.Before,
				1,
				[1, 2],
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
			|  return arg1 + arg2;
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|foo(1, 2);`;
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 0, "Before", "");
			expect(hookCallMap.size).toEqual(1);
			const [calls, hooks] = hookCallMap.get(0) as [number, Hook];
			expect(calls).toEqual(0);
			expectTrackedHooks(hookTracker.applied, []);
			hookTracker.categorizeUnknown([hooks]);
			expectTrackedHooks(hookTracker.notApplied, ["baz"]);
			expectTrackedHooks(hookTracker.available, ["foo", "bar"]);
		});
		it("two Before hooks called before function", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				2,
				[1, 2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 2, "Before", "foo");
			expect(hookCallMap.size).toEqual(2);
			expectHook(0, hookCallMap);
			expectHook(1, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo"]);
			expectTrackedHooks(hookTracker.available, ["bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one Before hook called before a function expression", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Before", "foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo"]);
			expectTrackedHooks(hookTracker.available, ["bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one Before hook called before a class method", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerMethodHook(
				"A.foo",
				hooking.HookType.Before,
				1,
				[2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Before", "A.foo");
			expect(hookCallMap.size).toEqual(1);
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["A.foo"]);
			expectTrackedHooks(hookTracker.available, [
				"A.constructor",
				"A.bar",
				"foo",
			]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one Before hook called before an method in a class expression", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerMethodHook(
				"A.foo",
				hooking.HookType.Before,
				1,
				[2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Before", "A.foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["A.foo"]);
			expectTrackedHooks(hookTracker.available, [
				"A.constructor",
				"A.bar",
				"foo",
			]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one Before hook called before an object method with assignment", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerMethodHook(
				"A.foo",
				hooking.HookType.Before,
				1,
				[2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Before", "A.foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["A.foo"]);
			expectTrackedHooks(hookTracker.available, ["A.bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one Before hook called before an object method as property", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerMethodHook(
				"obj.foo",
				hooking.HookType.Before,
				1,
				[2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Before", "obj.foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["obj.foo"]);
			expectTrackedHooks(hookTracker.available, ["obj.bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one Before hook called before a nested function", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"foo.bar",
				hooking.HookType.Before,
				1,
				[2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(4);
			});
			expectLogHooks(dbgMock, 1, "Before", "foo.bar");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo.bar"]);
			expectTrackedHooks(hookTracker.available, ["foo", "bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
	});
	describe("After hooks", () => {
		it("one hook called after a sync function", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "After", "foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo"]);
			expectTrackedHooks(hookTracker.available, ["bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("two hooks called after a sync function", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.After,
				2,
				[1, 2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 2, "After", "foo");
			expect(hookCallMap.size).toEqual(2);
			expectHook(0, hookCallMap);
			expectHook(1, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo"]);
			expectTrackedHooks(hookTracker.available, ["bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});

		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		it("one hook called after an async function", (): any => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerAsyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2],
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

			const dbgMock = withDebug(() => {
				return expectInstrumentationEval<Promise<number>>(input, output)?.then(
					(result: number) => {
						expect(result).toEqual(3);
						expect(hookCallMap.size).toEqual(1);
						expectHook(0, hookCallMap);
						expectTrackedHooks(hookTracker.applied, ["foo"]);
						expectTrackedHooks(hookTracker.available, ["bar"]);
						expectTrackedHooksUnknown(hookCallMap, 0);
					},
				);
			});
			expectLogHooks(dbgMock, 1, "After", "foo");
		});

		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		it("two hooks called after an async function", (): any => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerAsyncFunctionHook(
				"foo",
				hooking.HookType.After,
				2,
				[1, 2],
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

			const dbgMock = withDebug(() => {
				return expectInstrumentationEval<Promise<number>>(input, output)?.then(
					(result: number) => {
						expect(result).toEqual(3);
						expect(hookCallMap.size).toEqual(2);
						expectHook(0, hookCallMap);
						expectHook(1, hookCallMap);
						expectTrackedHooks(hookTracker.applied, ["foo"]);
						expectTrackedHooks(hookTracker.available, ["bar"]);
						expectTrackedHooksUnknown(hookCallMap, 0);
					},
				);
			});
			expectLogHooks(dbgMock, 2, "After", "foo");
		});
	});
	describe("Replace hooks", () => {
		it("one hook called instead of the original function", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Replace,
				1,
				[1, 2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Replace", "foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo"]);
			expectTrackedHooks(hookTracker.available, ["bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
		it("one hook for a nested function is called instead of the original function", () => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const hookCallMap = registerSyncFunctionHook(
				"a.foo",
				hooking.HookType.Replace,
				1,
				[],
			);
			const input = `
			|function a(arg1, arg2) {
			|  function foo() {
			|  	 return arg1 + arg2;
			|  }
			|  return foo();
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|a(1, 2);`;
			const output = `
			|function a(arg1, arg2) {
			|  function foo() {
			|    const a_foo_original = () => {
			|      return arg1 + arg2;
			|    };
			|
			|    return HookManager.callHook(0, this, [], a_foo_original);
			|  }
			|
			|  return foo();
			|}
			|
			|function bar(arg1) {
			|  console.log(arg1);
			|}
			|
			|a(1, 2);`;
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 1, "Replace", "a.foo");
			expect(hookCallMap.size).toEqual(1);
			expectHook(0, hookCallMap);
			expectTrackedHooks(hookTracker.applied, ["a.foo"]);
			expectTrackedHooks(hookTracker.available, ["a", "bar"]);
			expectTrackedHooksUnknown(hookCallMap, 0);
		});
	});
	describe("Before and After hooks", () => {
		it("one Before and ond After hook for a sync function", function () {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const beforeHookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2],
			);
			const afterHookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2],
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
			const dbgMock = withDebug(() => {
				expect(expectInstrumentationEval<number>(input, output)).toEqual(3);
			});
			expectLogHooks(dbgMock, 2, "Before", "foo");
			expect(beforeHookCallMap.size).toEqual(1);
			expectHook(0, beforeHookCallMap);
			expect(afterHookCallMap.size).toEqual(1);
			expectHook(0, afterHookCallMap);
			expectTrackedHooks(hookTracker.applied, ["foo"]);
			expectTrackedHooks(hookTracker.available, ["bar"]);
			expectTrackedHooksUnknown(beforeHookCallMap, 0);
			expectTrackedHooksUnknown(afterHookCallMap, 0);
		});
		//eslint-disable-next-line @typescript-eslint/no-explicit-any
		it("one Before and ond After hook for an async function", (): any => {
			hooking.hookManager.clearHooks();
			hookTracker.clear();
			const beforeHookCallMap = registerSyncFunctionHook(
				"foo",
				hooking.HookType.Before,
				1,
				[1, 2],
			);
			const afterHookCallMap = registerAsyncFunctionHook(
				"foo",
				hooking.HookType.After,
				1,
				[1, 2],
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

			const dbgMock = withDebug(
				() =>
					expectInstrumentationEval<Promise<number>>(input, output)?.then(
						(result: number) => {
							expect(result).toEqual(3);
							expect(beforeHookCallMap.size).toEqual(1);
							expectHook(0, beforeHookCallMap);
							expect(afterHookCallMap.size).toEqual(1);
							expectHook(0, afterHookCallMap);
							expectTrackedHooks(hookTracker.applied, ["foo"]);
							expectTrackedHooks(hookTracker.available, ["bar"]);
							expectTrackedHooksUnknown(beforeHookCallMap, 0);
							expectTrackedHooksUnknown(afterHookCallMap, 0);
						},
					),
			);

			expectLogHooks(dbgMock, 2, "Before", "foo");
		});
	});
});

function registerHookManagerGlobally() {
	// @ts-ignore
	global.HookManager = hooking.hookManager;
}

function registerSyncFunctionHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[],
) {
	return registerHook(target, hookType, numHooks, expectedParams, false, false);
}
function registerAsyncFunctionHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[],
) {
	return registerHook(target, hookType, numHooks, expectedParams, false, true);
}
function registerMethodHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[],
) {
	return registerHook(target, hookType, numHooks, expectedParams, true, false);
}

function registerHook(
	target: string,
	hookType: hooking.HookType,
	numHooks: number,
	expectedParams: number[],
	isMethod: boolean,
	isAsync: boolean,
) {
	const hookCallMap = new Map<number, [number, Hook]>();
	for (let i = 0; i < numHooks; i++) {
		const hook = hooking.hookManager.registerHook(
			hookType,
			target,
			"pkg",
			isAsync,
			// eslint-disable-next-line @typescript-eslint/ban-types
			(
				thisPtr: unknown,
				params: number[],
				_hookId: number,
				// eslint-disable-next-line @typescript-eslint/ban-types
				originalFunction: Function,
			) => {
				const [calls, hook] = hookCallMap.get(i) as [number, Hook];
				hookCallMap.set(i, [calls + 1, hook]);
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
			},
		);
		hookCallMap.set(i, [0, hook]);
	}
	return hookCallMap;
}

//eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDebug(fn: () => void): jest.Mock<any, any> {
	const log = console.log;
	const mock = jest.fn();
	console.log = mock;
	process.env["JAZZER_DEBUG"] = "1";
	try {
		fn();
	} finally {
		console.log = log;
		delete process.env["JAZZER_DEBUG"];
	}
	return mock;
}

function expectLogHooks(
	//eslint-disable-next-line @typescript-eslint/no-explicit-any
	mock: jest.Mock<any, any>,
	callsites: number,
	hookType: string,
	hookName: string,
) {
	expect(mock).toBeCalledTimes(callsites);
	if (callsites > 0) {
		const hookTp: string = mock.mock.calls[0][1];
		expect(hookTp).toEqual(hookType);
		const hookNm: string = mock.mock.calls[0][3];
		expect(hookNm).toEqual(hookName);
	}
}

// Only given functionNames (and none else) should be present in trackedHooks.
function expectTrackedHooks(
	trackedHooks: TrackedHook[],
	functionNames: string[],
) {
	expect(
		trackedHooks.every((h) => functionNames.includes(h.target)),
	).toBeTruthy();
	expect(trackedHooks.length).toEqual(functionNames.length);
}

function expectTrackedHooksUnknown(
	hookMap: Map<number, [number, Hook]>,
	id: number,
) {
	const [_calls, hooks] = hookMap.get(id) as [number, Hook];
	hookTracker.categorizeUnknown([hooks]);
	expectTrackedHooks(hookTracker.notApplied, []);
}

function expectHook(idx: number, hookCallMap: Map<number, [number, Hook]>) {
	const [calls, _hooks] = hookCallMap.get(idx) as [number, Hook];
	expect(calls).toEqual(1);
}
