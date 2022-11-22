# Jest Integration Example

To use the [Jest](https://jestjs.io/) integration install the
`@jazzer.js/jest-runner` package and configure it as a dedicated test runner in
`package.json`.

The example below shows how to configure the Jazzer.js Jest integration in
combination with the normal Jest runner.

```json
"jest": {
  "projects": [
    {
      "displayName": "test"
    },
    {
      "runner": "@jazzer.js/jest-runner",
      "displayName": {
        "name": "Jazzer.js",
        "color": "cyan"
      },
      "testMatch": [
        "<rootDir>/**/*.fuzz.js"
      ]
    }
  ]
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
