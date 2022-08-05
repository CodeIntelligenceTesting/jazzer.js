/*
 * Copyright 2022 Code Intelligence GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BinaryExpression, SwitchStatement } from "@babel/types";
import { NodePath, PluginTarget, types } from "@babel/core";
import { fakePC, newIdentifier } from "./helpers";

export function compareHooks(): PluginTarget {
	return {
		visitor: {
			BinaryExpression(path: NodePath<BinaryExpression>) {
				// TODO: Investigate this type, it can not be passed to the call expression
				if (path.node.left.type == "PrivateName") {
					return;
				}

				let hookFunctionName: string;
				if (isStringCompare(path.node)) {
					hookFunctionName = "Fuzzer.traceStrCmp";
				} else if (isNumberCompare(path.node)) {
					hookFunctionName = "Fuzzer.traceNumberCmp";
				} else {
					return;
				}

				path.replaceWith(
					types.callExpression(types.identifier(hookFunctionName), [
						path.node.left,
						path.node.right,
						types.stringLiteral(path.node.operator),
						fakePC(),
					])
				);
			},
			SwitchStatement(path: NodePath<SwitchStatement>) {
				const id = newIdentifier("switch");
				path.node.discriminant = types.sequenceExpression([
					types.assignmentExpression("=", id, path.node.discriminant),
					id,
				]);
				for (const i in path.node.cases) {
					const test = path.node.cases[i].test;
					if (test) {
						path.node.cases[i].test = types.callExpression(
							types.identifier("Fuzzer.traceAndReturn"),
							[id, test, fakePC()]
						);
					}
				}
			},
		},
	};
}

function isStringCompare(exp: BinaryExpression): boolean {
	// One operand has to be a string literal but not both
	if (
		(exp.left.type !== "StringLiteral" && exp.right.type !== "StringLiteral") ||
		(exp.left.type === "StringLiteral" && exp.right.type === "StringLiteral")
	) {
		return false;
	}

	// Only support equals and not equals operators, the other ones can
	// not be forwarded to libFuzzer
	return ["==", "===", "!=", "!=="].includes(exp.operator);
}

function isNumberCompare(exp: BinaryExpression): boolean {
	// One operand has to be a string literal but not both
	if (
		(exp.left.type !== "NumericLiteral" &&
			exp.right.type !== "NumericLiteral") ||
		(exp.left.type === "NumericLiteral" && exp.right.type === "NumericLiteral")
	) {
		return false;
	}
	return ["==", "===", "!=", "!==", ">", ">=", "<", "<="].includes(
		exp.operator
	);
}
