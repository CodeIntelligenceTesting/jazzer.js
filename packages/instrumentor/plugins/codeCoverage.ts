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
import { nextCounter } from "@fuzzy-eagle/fuzzer";

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
