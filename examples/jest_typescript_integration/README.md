# Jest Typscript Integration Example

Detailed documentation on the Jest integration is available in the main
[Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md)
documentation.

## Quickstart

To use the [Jest](https://jestjs.io/) integration install the
`@jazzer.js/jest-runner` and `ts-jest` packages then configure `jest-runner` as
a dedicated test runner in `package.json`.

The example below shows how to configure the Jazzer.js Jest integration in
combination with the normal Jest runner.

```json
  "jest": {
    "projects": [
      {
        "preset": "ts-jest",
        "displayName": "tests",
        "modulePathIgnorePatterns": ["dist"],
      },
      {
        "preset": "ts-jest",
        "runner": "@jazzer.js/jest-runner",
        "testEnvironment": "node",
        "modulePathIgnorePatterns": [
          "dist",
          "packages/fuzzer/build",
          "tests/code_coverage",
        ],
        "transformIgnorePatterns": ["node_modules"],
        "testMatch": ["<rootDir>/*.fuzz.[jt]s"],
        "coveragePathIgnorePatterns": ["/node_modules/", "/dist/"],
      },
    ],
    "collectCoverageFrom": ["**/*.ts"],
  }
```

Further configuration can be specified in `.jazzerjsrc.json` in the following
format:

```json
{
	"includes": ["*"],
	"excludes": ["node_modules"],
	"customHooks": [],
	"fuzzerOptions": [],
	"sync": false
}
```

Write a fuzz test like:

```typescript
// file: jazzerjs.fuzz.ts
import "@jazzer.js/jest-runner/jest-extension";
describe("My describe", () => {
	it.fuzz("My fuzz test", (data) => {
		target.fuzzMe(data);
	});
});
```

**Note:** the `import` statement extends `jest`'s `It` interface to include the
`fuzz` property and is necessary for Typescript to compile the test file.
