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
	isBlockStatement,
	isLogicalExpression,
} from "@babel/types";
import { NodePath, PluginTarget, types } from "@babel/core";
import { EdgeIdStrategy } from "../edgeIdStrategy";

export function codeCoverage(idStrategy: EdgeIdStrategy): () => PluginTarget {
	return () => {
		return {
			visitor: {
				// eslint-disable-next-line @typescript-eslint/ban-types
				Function(path: NodePath<Function>) {
					if (isBlockStatement(path.node.body)) {
						const bodyStmt = path.node.body as BlockStatement;
						if (bodyStmt) {
							bodyStmt.body.unshift(makeCounterIncStmt(idStrategy));
						}
					}
				},
				IfStatement(path: NodePath<IfStatement>) {
					path.node.consequent = addCounterToStmt(
						path.node.consequent,
						idStrategy
					);
					if (path.node.alternate) {
						path.node.alternate = addCounterToStmt(
							path.node.alternate,
							idStrategy
						);
					}
					path.insertAfter(makeCounterIncStmt(idStrategy));
				},
				SwitchStatement(path: NodePath<SwitchStatement>) {
					path.node.cases.forEach((caseStmt) =>
						caseStmt.consequent.unshift(makeCounterIncStmt(idStrategy))
					);
					path.insertAfter(makeCounterIncStmt(idStrategy));
				},
				Loop(path: NodePath<Loop>) {
					path.node.body = addCounterToStmt(path.node.body, idStrategy);
					path.insertAfter(makeCounterIncStmt(idStrategy));
				},
				TryStatement(path: NodePath<TryStatement>) {
					const catchStmt = path.node.handler;
					if (catchStmt) {
						catchStmt.body.body.unshift(makeCounterIncStmt(idStrategy));
					}
					path.insertAfter(makeCounterIncStmt(idStrategy));
				},
				LogicalExpression(path: NodePath<LogicalExpression>) {
					if (!isLogicalExpression(path.node.left)) {
						path.node.left = types.sequenceExpression([
							makeCounterIncExpr(idStrategy),
							path.node.left,
						]);
					}
					if (!isLogicalExpression(path.node.right)) {
						path.node.right = types.sequenceExpression([
							makeCounterIncExpr(idStrategy),
							path.node.right,
						]);
					}
				},
				ConditionalExpression(path: NodePath<ConditionalExpression>) {
					path.node.consequent = types.sequenceExpression([
						makeCounterIncExpr(idStrategy),
						path.node.consequent,
					]);
					path.node.alternate = types.sequenceExpression([
						makeCounterIncExpr(idStrategy),
						path.node.alternate,
					]);
					if (isBlockStatement(path.parent)) {
						path.insertAfter(makeCounterIncStmt(idStrategy));
					}
				},
			},
		};
	};
}

function addCounterToStmt(
	stmt: Statement,
	strategy: EdgeIdStrategy
): BlockStatement {
	const counterStmt = makeCounterIncStmt(strategy);
	if (isBlockStatement(stmt)) {
		const br = stmt as BlockStatement;
		br.body.unshift(counterStmt);
		return br;
	} else {
		return types.blockStatement([counterStmt, stmt]);
	}
}

function makeCounterIncStmt(strategy: EdgeIdStrategy): ExpressionStatement {
	return types.expressionStatement(makeCounterIncExpr(strategy));
}

function makeCounterIncExpr(strategy: EdgeIdStrategy): Expression {
	return types.callExpression(types.identifier("Fuzzer.incrementCounter"), [
		types.numericLiteral(strategy.nextEdgeId()),
	]);
}
