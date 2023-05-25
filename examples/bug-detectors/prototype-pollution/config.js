// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
	getBugDetectorConfiguration,
	// eslint-disable-next-line @typescript-eslint/no-var-requires
} = require("../../../packages/bug-detectors");

getBugDetectorConfiguration("prototype-pollution")
	?.instrumentAssignmentsAndVariableDeclarations()
	?.addExcludedExactMatch("example");
