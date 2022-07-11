export function shouldInstrument(
	includes: string[],
	excludes: string[]
): (filepath: string) => boolean {
	return (filepath: string) => {
		const included =
			includes.find((include) => filepath.includes(include)) !== undefined;
		const excluded =
			excludes.find((exclude) => filepath.includes(exclude)) !== undefined;
		return included && !excluded;
	};
}
