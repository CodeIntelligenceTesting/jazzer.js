import { FuzzTest } from "./fuzz";

// Global definition of the Jest fuzz test extension function.
// This is required to allow the Typescript compiler to recognize it.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace jest {
		interface It {
			fuzz: FuzzTest;
		}
	}
}
