const lib = require("./lib");

if (process.argv.length > 2) lib.revealSecrets(process.argv[2]);
