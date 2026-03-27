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
	Node,
	Statement,
	SwitchStatement,
	TryStatement,
} from "@babel/types";

export interface EdgeLocation {
	line: number;
	col: number;
	func: string;
}

/** Map-backed string interner for compact edge-location serialization. */
export class StringInterner {
	private readonly table: string[] = [];
	private readonly index = new Map<string, number>();

	intern(s: string): number {
		let idx = this.index.get(s);
		if (idx === undefined) {
			idx = this.table.length;
			this.table.push(s);
			this.index.set(s, idx);
		}
		return idx;
	}

	strings(): string[] {
		return this.table;
	}

	clear(): void {
		this.table.length = 0;
		this.index.clear();
	}
}

type Loc = { line: number; column: number } | null | undefined;

function enclosingFuncName(path: NodePath): string {
	const fn = path.isFunction() ? path : path.getFunctionParent();
	if (!fn) return "<top-level>";
	const node = fn.node;
	if (types.isFunctionDeclaration(node) && node.id) return node.id.name;
	if (types.isFunctionExpression(node) && node.id) return node.id.name;

	const parent = fn.parentPath;
	if (parent?.isVariableDeclarator() && types.isIdentifier(parent.node.id))
		return parent.node.id.name;
	if (parent?.isAssignmentExpression() && types.isIdentifier(parent.node.left))
		return parent.node.left.name;
	if (parent?.isObjectProperty() && types.isIdentifier(parent.node.key))
		return parent.node.key.name;
	if (parent?.isClassMethod() && types.isIdentifier(parent.node.key))
		return parent.node.key.name;
	if (parent?.isObjectMethod() && types.isIdentifier(parent.node.key))
		return parent.node.key.name;
	return "<anonymous>";
}

/**
 * Build a Babel visitor that inserts a counter expression at every
 * branch point.  The caller decides what that expression looks like.
 *
 * When `onEdge` is provided it is called once per counter, receiving
 * the source location and enclosing function name.  This powers
 * PC-to-source symbolization for libFuzzer's `-print_pcs` output.
 */
export function makeCoverageVisitor(
	makeCounterExpr: () => Expression,
	onEdge?: (loc: EdgeLocation) => void,
): Visitor {
	/** @param locNode  AST node whose `.loc` supplies the source position. */
	function emitCounter(path: NodePath, locNode: Node): Expression {
		if (onEdge) {
			const loc: Loc = locNode.loc?.start;
			onEdge({
				line: loc?.line ?? 0,
				col: loc?.column ?? 0,
				func: enclosingFuncName(path),
			});
		}
		return makeCounterExpr();
	}

	function makeStmt(path: NodePath, locNode: Node): ExpressionStatement {
		return types.expressionStatement(emitCounter(path, locNode));
	}

	function wrapWithCounter(path: NodePath, stmt: Statement): BlockStatement {
		const counter = makeStmt(path, stmt);
		if (isBlockStatement(stmt)) {
			stmt.body.unshift(counter);
			return stmt;
		}
		return types.blockStatement([counter, stmt]);
	}

	return {
		Function(path: NodePath<Function>) {
			if (isBlockStatement(path.node.body)) {
				path.node.body.body.unshift(makeStmt(path, path.node));
			}
		},
		IfStatement(path: NodePath<IfStatement>) {
			path.node.consequent = wrapWithCounter(path, path.node.consequent);
			if (path.node.alternate) {
				path.node.alternate = wrapWithCounter(path, path.node.alternate);
			}
			path.insertAfter(makeStmt(path, path.node));
		},
		SwitchStatement(path: NodePath<SwitchStatement>) {
			for (const caseClause of path.node.cases) {
				caseClause.consequent.unshift(makeStmt(path, caseClause));
			}
			path.insertAfter(makeStmt(path, path.node));
		},
		Loop(path: NodePath<Loop>) {
			path.node.body = wrapWithCounter(path, path.node.body);
			path.insertAfter(makeStmt(path, path.node));
		},
		TryStatement(path: NodePath<TryStatement>) {
			if (path.node.handler) {
				path.node.handler.body.body.unshift(makeStmt(path, path.node.handler));
			}
			path.insertAfter(makeStmt(path, path.node));
		},
		LogicalExpression(path: NodePath<LogicalExpression>) {
			if (!isLogicalExpression(path.node.left)) {
				path.node.left = types.sequenceExpression([
					emitCounter(path, path.node),
					path.node.left,
				]);
			}
			if (!isLogicalExpression(path.node.right)) {
				path.node.right = types.sequenceExpression([
					emitCounter(path, path.node),
					path.node.right,
				]);
			}
		},
		ConditionalExpression(path: NodePath<ConditionalExpression>) {
			path.node.consequent = types.sequenceExpression([
				emitCounter(path, path.node),
				path.node.consequent,
			]);
			path.node.alternate = types.sequenceExpression([
				emitCounter(path, path.node),
				path.node.alternate,
			]);
			if (isBlockStatement(path.parent)) {
				path.insertAfter(makeStmt(path, path.node));
			}
		},
	};
}
