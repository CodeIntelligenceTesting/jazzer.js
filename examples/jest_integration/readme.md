# Jest Integration Example

Install all dependencies and run Jest test like you would normally do.

## Runner

To use the custom runner add the following snippet to `package.json`:

```json
"jest": {
  "runner": "@jazzer.js/jest-runner",
  "displayName": "fuzz",
  "testMatch": ["<rootDir>/*.fuzz.js"]
}
```
