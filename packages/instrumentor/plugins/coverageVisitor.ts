/*
 * Copyright 2026 Code Intelligence GmbH
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

/**
 * Shared coverage instrumentation visitor.
 *
 * Both the CJS instrumentor (incrementCounter calls) and the ESM
 * instrumentor (direct array writes) inject counters at the same
 * AST locations.  This module captures that shared visitor shape
 * and lets each variant supply its own expression generator.
 */

import { NodePath, types, Visitor } from "@babel/core";
import {
	BlockStatement,
	ConditionalExpression,
	Expression,
	ExpressionStatement,
	Function,
	IfStatement,
	isBlockStatement,
	isLogicalExpression,
	LogicalExpression,
	Loop,
	Statement,
	SwitchStatement,
	TryStatement,
} from "@babel/types";

/**
 * Build a Babel visitor that inserts a counter expression at every
 * branch point.  The caller decides what that expression looks like.
 */
export function makeCoverageVisitor(
	makeCounterExpr: () => Expression,
): Visitor {
	function makeStmt(): ExpressionStatement {
		return types.expressionStatement(makeCounterExpr());
	}

	function wrapWithCounter(stmt: Statement): BlockStatement {
		const counter = makeStmt();
		if (isBlockStatement(stmt)) {
			stmt.body.unshift(counter);
			return stmt;
		}
		return types.blockStatement([counter, stmt]);
	}

	return {
		Function(path: NodePath<Function>) {
			if (isBlockStatement(path.node.body)) {
				path.node.body.body.unshift(makeStmt());
			}
		},
		IfStatement(path: NodePath<IfStatement>) {
			path.node.consequent = wrapWithCounter(path.node.consequent);
			if (path.node.alternate) {
				path.node.alternate = wrapWithCounter(path.node.alternate);
			}
			path.insertAfter(makeStmt());
		},
		SwitchStatement(path: NodePath<SwitchStatement>) {
			for (const caseClause of path.node.cases) {
				caseClause.consequent.unshift(makeStmt());
			}
			path.insertAfter(makeStmt());
		},
		Loop(path: NodePath<Loop>) {
			path.node.body = wrapWithCounter(path.node.body);
			path.insertAfter(makeStmt());
		},
		TryStatement(path: NodePath<TryStatement>) {
			if (path.node.handler) {
				path.node.handler.body.body.unshift(makeStmt());
			}
			path.insertAfter(makeStmt());
		},
		LogicalExpression(path: NodePath<LogicalExpression>) {
			if (!isLogicalExpression(path.node.left)) {
				path.node.left = types.sequenceExpression([
					makeCounterExpr(),
					path.node.left,
				]);
			}
			if (!isLogicalExpression(path.node.right)) {
				path.node.right = types.sequenceExpression([
					makeCounterExpr(),
					path.node.right,
				]);
			}
		},
		ConditionalExpression(path: NodePath<ConditionalExpression>) {
			path.node.consequent = types.sequenceExpression([
				makeCounterExpr(),
				path.node.consequent,
			]);
			path.node.alternate = types.sequenceExpression([
				makeCounterExpr(),
				path.node.alternate,
			]);
			if (isBlockStatement(path.parent)) {
				path.insertAfter(makeStmt());
			}
		},
	};
}
