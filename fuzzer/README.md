# Fuzzer plugin for Node

This plugin loads libfuzzer into Node. For now, it can be built with `npm
install`; a subsequent `npm test` will make sure that it can be loaded. More
docs to come...

## Development

When working on the plugin's C++ code, you may want to use a language server
like `clangd` for IDE features. CMake is configured to emit a
`compile_commands.json` file, so the language server should work after the first
`npm install`.
