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
						types.callExpression(types.identifier("Fuzzer.traceStrCmp"), [
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
