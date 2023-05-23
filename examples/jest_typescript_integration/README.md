# Jest Typscript Integration Example

Detailed documentation on the Jest integration is available in the main
[Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js/blob/main/docs/jest-integration.md)
documentation.

## Quickstart

To use the [Jest](https://jestjs.io/) integration install the
`@jazzer.js/jest-runner` and `ts-jest` packages then configure `jest-runner` as
a dedicated test runner in `package.json` or `jest.config.{ts|js}`.

The example below shows how to configure the Jazzer.js Jest integration in
combination with the normal Jest runner.

```json
  "jest": {
    "projects": [
      {
        "displayName": "Jest",
        "preset": "ts-jest",
      },
      {
        "displayName": {
          "name": "Jazzer.js",
          "color": "cyan",
        },
        "preset": "ts-jest",
        "runner": "@jazzer.js/jest-runner",
        "testEnvironment": "node",
        "testMatch": ["<rootDir>/*.fuzz.[jt]s"],
      },
    ],
    "coveragePathIgnorePatterns": ["/node_modules/", "/dist/"],
    "modulePathIgnorePatterns": ["/node_modules", "/dist/"],
  }
```

Further configuration can be specified in `.jazzerjsrc`, like in any other
project, in the following format:

```json
{
	"includes": ["*"],
	"excludes": ["node_modules"],
    [...]
}
```

Write a Jest fuzz test like:

```typescript
// file: jazzerjs.fuzz.ts
import "@jazzer.js/jest-runner/jest-extension";
describe("My describe", () => {
	it.fuzz("My fuzz test", (data: Buffer) => {
		target.fuzzMe(data);
	});
});
```

**Note:** the `import` statement extends `jest`'s `It` interface to include the
`fuzz` property and is necessary for TypeScript to compile the test file.
