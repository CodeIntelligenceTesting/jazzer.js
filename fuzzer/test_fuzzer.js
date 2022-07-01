const fuzzer = require("./fuzzer");

fuzzer.printVersion();

// Our fake fuzz target.
const fuzz = (data) => {
  console.log("Fuzz target called with", data);
}

fuzzer.startFuzzing(fuzz, ["-runs=0"]);
