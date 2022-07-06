import { BabelFileResult, PluginTarget, transformSync } from "@babel/core";

export function instrumentWith(...plugins: PluginTarget[]) {
	return (input: string, output: string) => {
		expectInstrumentation(plugins, input, output);
		return undefined;
	};
}

export function instrumentAndEvalWith(...plugins: PluginTarget[]) {
	return <T>(input: string, output: string): T | undefined => {
		const result = expectInstrumentation(plugins, input, output);
		if (result?.code) {
			return eval(result.code) as T;
		}
		return undefined;
	};
}

function expectInstrumentation(
	plugins: PluginTarget[],
	input: string,
	output: string
): BabelFileResult | null {
	const result = transformSync(removeIndentation(input), {
		plugins: plugins,
	});
	expect(result?.code).toBe(removeIndentation(output));
	return result;
}

function removeIndentation(text: string): string {
	return text.replace(/^\s*\|/gm, "");
}
