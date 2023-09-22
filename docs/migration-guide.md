# Migration Guide

This document describes breaking changes in major versions and steps to migrate
from one to the next.

## 2.0.0

This version fundamentally changed the Jest integration in module
`@jazzer.js/jest-runner`. The new approach provides a tighter integration with
Jest and allows fuzz tests to use all available Jest features. Most notably this
includes the widely missed mocking functionality.

### Migration steps

- In the Jest configuration, move `@jazzer.js/jest-runner` from `runner` to
  `testRunner`. A valid configuration looks like this:

```diff
{
  displayName: {
  	name: "Jazzer.js",
  	color: "cyan",
  },
  preset: "ts-jest",
-  runner: "@jazzer.js/jest-runner",
+  testRunner: "@jazzer.js/jest-runner",
  testEnvironment: "node",
  testMatch: ["<rootDir>/*.fuzz.[jt]s"],
}
```
