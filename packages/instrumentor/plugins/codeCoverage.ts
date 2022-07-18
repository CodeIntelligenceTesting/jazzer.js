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

import {
	BlockStatement,
	ConditionalExpression,
	Expression,
	ExpressionStatement,
	Function,
	IfStatement,
	LogicalExpression,
	Loop,
	Statement,
	SwitchStatement,
	TryStatement,
} from "@babel/types";
import { NodePath, PluginTarget, types } from "@babel/core";
import { nextCounter } from "@jazzer.js/fuzzer";

export function codeCoverage(): PluginTarget {
	return {
		visitor: {
			// eslint-disable-next-line @typescript-eslint/ban-types
			Function(path: NodePath<Function>) {
				const bodyStmt = path.node.body as BlockStatement;
				if (bodyStmt) {
					bodyStmt.body.unshift(makeCounterIncStmt());
				}
			},
			IfStatement(path: NodePath<IfStatement>) {
				path.node.consequent = addCounterToStmt(path.node.consequent);
				if (path.node.alternate) {
					path.node.alternate = addCounterToStmt(path.node.alternate);
				}
				path.insertAfter(makeCounterIncStmt());
			},
			SwitchStatement(path: NodePath<SwitchStatement>) {
				path.node.cases.forEach((caseStmt) =>
					caseStmt.consequent.unshift(makeCounterIncStmt())
				);
				path.insertAfter(makeCounterIncStmt());
			},
			Loop(path: NodePath<Loop>) {
				path.node.body = addCounterToStmt(path.node.body);
				path.insertAfter(makeCounterIncStmt());
			},
			TryStatement(path: NodePath<TryStatement>) {
				const catchStmt = path.node.handler;
				if (catchStmt) {
					catchStmt.body.body.unshift(makeCounterIncStmt());
				}
				path.insertAfter(makeCounterIncStmt());
			},
			LogicalExpression(path: NodePath<LogicalExpression>) {
				if (path.node.left.type !== "LogicalExpression") {
					path.node.left = types.sequenceExpression([
						makeCounterIncExpr(),
						path.node.left,
					]);
				}
				if (path.node.right.type !== "LogicalExpression") {
					path.node.right = types.sequenceExpression([
						makeCounterIncExpr(),
						path.node.right,
					]);
				}
			},
			ConditionalExpression(path: NodePath<ConditionalExpression>) {
				path.node.consequent = types.sequenceExpression([
					makeCounterIncExpr(),
					path.node.consequent,
				]);
				path.node.alternate = types.sequenceExpression([
					makeCounterIncExpr(),
					path.node.alternate,
				]);
				path.insertAfter(makeCounterIncStmt());
			},
		},
	};
}

function addCounterToStmt(stmt: Statement): BlockStatement {
	const counterStmt = makeCounterIncStmt();
	if (stmt.type == "BlockStatement") {
		const br = stmt as BlockStatement;
		br.body.unshift(counterStmt);
		return br;
	} else {
		return types.blockStatement([counterStmt, stmt]);
	}
}

function makeCounterIncStmt(): ExpressionStatement {
	return types.expressionStatement(makeCounterIncExpr());
}

function makeCounterIncExpr(): Expression {
	return types.callExpression(types.identifier("Fuzzer.incrementCounter"), [
		types.numericLiteral(nextCounter()),
	]);
}
