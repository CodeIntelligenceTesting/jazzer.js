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
import { nextCounter } from "../../native";

function addCounterToStmt(branchStmt: Statement): BlockStatement {
  let counterStmt = makeCounterIncStmt();
  if (branchStmt.type == "BlockStatement") {
    const br = branchStmt as BlockStatement;
    br.body.unshift(counterStmt);
    return br;
  } else {
    return types.blockStatement([counterStmt, branchStmt]);
  }
}

function makeCounterIncStmt(): ExpressionStatement {
  return types.expressionStatement(makeCounterIncExpr());
}

function makeCounterIncExpr(): Expression {
  return types.callExpression(types.identifier("incrementCounter"), [
    types.numericLiteral(nextCounter()),
  ]);
}

export function codeCoverage(): PluginTarget {
  return {
    visitor: {
      Function(path: NodePath<Function>) {
        let bodyStmt = path.node.body as BlockStatement;
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
        let catchStmt = path.node.handler;
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
