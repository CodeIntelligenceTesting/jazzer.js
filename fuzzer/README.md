# Fuzzer plugin for Node

This plugin loads libfuzzer into Node. Users can install it with `npm install`,
which tries to download a prebuilt shared object from GitHub but falls back to
compilation on the user's machine if there is no suitable binary.

More docs to come...

## Development

The project can be built with `npm run compile` (which is incremental after the
first build); a subsequent `npm test` makes sure that the plugin loads cleanly.

When working on the plugin's C++ code, you may want to use a language server
like `clangd` for IDE features. CMake is configured to emit a
`compile_commands.json` file, so the language server should work after the first
`npm install`.
