/* eslint @typescript-eslint/no-var-requires: "off" */
const addon = require("bindings")("fuzzy-eagle");

// Re-export everything from the native library.
module.exports = addon;
