import { NodePath, PluginTarget, transformSync, types } from "@babel/core";
import {
  BlockStatement,
  ExpressionStatement,
  IfStatement,
  Function,
  Statement,
  Loop,
  SwitchStatement,
  TryStatement,
} from "@babel/types";

const { hookRequire } = require("istanbul-lib-hook");

// @ts-ignore
hookRequire(shouldInstrument, instrumentCode);

export function instrumentCode(code: string): string {
  let output = transformSync(code, {
    plugins: [addCodeCoverage],
  });
  console.log(output?.code);
  return output?.code || code;
}

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
  return types.expressionStatement(
    types.callExpression(types.identifier("incrementCounter"), [
      types.numericLiteral(nextCounter()),
    ])
  );
}

function nextCounter(): number {
  return 0;
}

function addCodeCoverage(): PluginTarget {
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
      },
      SwitchStatement(path: NodePath<SwitchStatement>) {
        path.node.cases.forEach((caseStmt) =>
          caseStmt.consequent.unshift(makeCounterIncStmt())
        );
      },
      Loop(path: NodePath<Loop>) {
        path.node.body = addCounterToStmt(path.node.body);
        path.insertAfter(makeCounterIncStmt());
      },
      TryStatement(path: NodePath<TryStatement>) {
        path.node.block.body.unshift(makeCounterIncStmt());
        let catchStmt = path.node.handler;
        if (catchStmt) {
          catchStmt.body.body.unshift(makeCounterIncStmt());
        }
      },
    },
  };
}

function shouldInstrument(filepath: string): boolean {
  return !filepath.includes("node_modules");
}

export function instrument(fuzzTargetPath: string) {
  let fuzzFn = require(fuzzTargetPath).fuzz;

  if (typeof fuzzFn !== "function") {
    throw new Error(`${fuzzTargetPath} has no fuzz function exported`);
  }
  console.log(`fuzzing ${typeof fuzzFn}`);
}
