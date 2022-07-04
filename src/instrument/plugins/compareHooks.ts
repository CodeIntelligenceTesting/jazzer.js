import { BinaryExpression } from "@babel/types";
import { NodePath, PluginTarget, types } from "@babel/core";

export function compareHooks(): PluginTarget {
	return {
		visitor: {
			BinaryExpression(path: NodePath<BinaryExpression>) {
				// One operand has to be a string literal but not both
				if (
					(path.node.left.type !== "StringLiteral" &&
						path.node.right.type !== "StringLiteral") ||
					(path.node.left.type === "StringLiteral" &&
						path.node.right.type === "StringLiteral")
				) {
					return;
				}

				// TODO: Investigate this type, it can not be passed to the call expression
				if (path.node.left.type == "PrivateName") {
					return;
				}

				// Only support equals and not equals operators, the other ones can
				// not be forwarded to libFuzzer
				if (
					path.node.operator === "==" ||
					path.node.operator === "===" ||
					path.node.operator === "!=" ||
					path.node.operator === "!=="
				) {
					path.replaceWith(
						types.callExpression(types.identifier("fuzzer.traceStrCmp"), [
							path.node.left,
							path.node.right,
							types.stringLiteral(path.node.operator),
						])
					);
				}
			},
		},
	};
}
