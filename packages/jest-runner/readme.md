# Jest Fuzz Runner

Custom Jest runner to executes fuzz tests via Jazzer.js, detailed documentation
can be found at the
[Jazzer.js GitHub page](https://github.com/CodeIntelligenceTesting/jazzer.js).

A fuzz test in Jest, in this case written in TypeScript, would look similar to
the following example:

```typescript
// file: "Target.fuzz.ts
// Import the fuzz testing extension to compile TS code.
import "@jazzer.js/jest-runner";
import * as target from "./target";

describe("Target", () => {
	it.fuzz("executes a method", (data: Buffer) => {
		target.fuzzMe(data);
	});
});
```
