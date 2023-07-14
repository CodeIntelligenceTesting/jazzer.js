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

import * as babel from "@babel/types";
import generate from "@babel/generator";
import { NodePath, PluginTarget, types } from "@babel/core";
import {
	hookManager,
	Hook,
	MatchingHooksResult,
	hookTracker,
	logHooks,
} from "@jazzer.js/hooking";

export function functionHooks(filepath: string): () => PluginTarget {
	return () => {
		return {
			visitor: {
				Function(path: NodePath<babel.Function>) {
					if (path.node.params.every((param) => babel.isIdentifier(param))) {
						const target = targetPath(path);
						if (applyHooks(filepath, target, path.node)) {
							path.skip();
						}
					}
				},
			},
		};
	};
}

type FunctionWithBlockBody = babel.Function & { body: babel.BlockStatement };

function applyHooks(
	filepath: string,
	functionName: string,
	functionNode: babel.Function,
): boolean {
	const matchedHooks = hookManager.matchingHooks(functionName, filepath);

	// We currently only handle hooking functions with identifiers as parameters.
	if (!functionNode.params.every((p) => babel.isIdentifier(p))) {
		return false;
	}
	if (!matchedHooks.hasHooks()) {
		hookTracker.addAvailable(filepath, functionName);
		return false;
	}

	for (const hook of matchedHooks.hooks) {
		hookTracker.addApplied(hook.pkg, hook.target);
	}

	// For arrow functions, the body can a single expression representing the value to be returned.
	// In this case, we replace the body by a block statement with a return statement.
	// This way, we can add calls to the hooks into the body.
	if (!babel.isBlockStatement(functionNode.body)) {
		functionNode.body = types.blockStatement([
			types.returnStatement(functionNode.body),
		]);
	}

	// Bind the original function to <fn name>_original
	// replace all points by underscores in the function name
	const origFuncName = functionName.replace(/\./g, "_") + "_original";
	if (matchedHooks.hasReplaceHooks() || matchedHooks.hasAfterHooks()) {
		defineInternalFunctionWithOriginalImplementation(
			functionNode as FunctionWithBlockBody,
			origFuncName,
		);
	}

	if (matchedHooks.hasReplaceHooks()) {
		addReplaceHooks(
			functionNode as FunctionWithBlockBody,
			matchedHooks,
			origFuncName,
		);
	}

	if (matchedHooks.hasAfterHooks()) {
		addAfterHooks(
			functionNode as FunctionWithBlockBody,
			matchedHooks,
			origFuncName,
		);
	}

	if (matchedHooks.hasBeforeHooks()) {
		addBeforeHooks(functionNode as FunctionWithBlockBody, matchedHooks);
	}

	logHooks(matchedHooks.hooks);

	return true;
}

function targetPath(path: NodePath<babel.Node>): string {
	return path.getAncestry().reduce((acc: string, p: NodePath<babel.Node>) => {
		if ("id" in p.node && babel.isIdentifier(p.node.id)) {
			return addElementToPath(p.node.id.name, acc);
		}
		if ("key" in p.node) {
			if (babel.isIdentifier(p.node.key)) {
				return addElementToPath(p.node.key.name, acc);
			} else if (babel.isStringLiteral(p.node.key)) {
				return addElementToPath(p.node.key.value, acc);
			}
		}

		if (babel.isAssignmentExpression(p.node)) {
			return addElementToPath(generate(p.node.left).code, acc);
		}

		return acc;
	}, "");
}

function addElementToPath(element: string, path: string): string {
	const separator = path ? "." : "";
	return element + separator + path;
}

function defineInternalFunctionWithOriginalImplementation(
	functionNode: FunctionWithBlockBody,
	origFuncName: string,
) {
	functionNode.body = types.blockStatement([
		createInternalFunctionFromBody(
			origFuncName,
			//TODO check this
			functionNode.params as Array<babel.Identifier>,
			functionNode.body,
		),
	]);
}

function addAfterHooks(
	functionNode: FunctionWithBlockBody,
	matchesResult: MatchingHooksResult,
	origFuncName: string,
) {
	const retVal = types.identifier(origFuncName + "_result");
	const origCal = callOriginalFunctionExpression(
		origFuncName,
		functionNode.params as Array<babel.Identifier>,
	);

	if (matchesResult.afterHooks[0].async) {
		let thenChainCallExpr = origCal;
		for (const afterHook of matchesResult.afterHooks) {
			thenChainCallExpr = types.callExpression(
				types.memberExpression(thenChainCallExpr, types.identifier("then")),
				[
					asyncHookThenExpression(
						afterHook,
						functionNode.params as Array<babel.Identifier>,
						retVal,
					),
				],
			);
		}
		functionNode.body.body.push(types.returnStatement(thenChainCallExpr));
	} else {
		functionNode.body.body.push(
			types.variableDeclaration("const", [
				types.variableDeclarator(retVal, origCal),
			]),
		);
		for (const afterHook of matchesResult.afterHooks) {
			functionNode.body.body.push(
				types.expressionStatement(
					callHookExpression(
						afterHook,
						functionNode.params as Array<babel.Identifier>,
						[retVal],
					),
				),
			);
		}
		functionNode.body.body.push(types.returnStatement(retVal));
	}
}

function addReplaceHooks(
	functionNode: FunctionWithBlockBody,
	matchesResult: MatchingHooksResult,
	origFuncName: string,
) {
	assert(
		babel.isBlockStatement(functionNode.body),
		"the function node must be a block statement",
	);
	functionNode.body.body.push(
		types.returnStatement(
			callHookExpression(
				matchesResult.replaceHooks[0],
				functionNode.params as Array<babel.Identifier>,
				[types.identifier(origFuncName)],
			),
		),
	);
}

function addBeforeHooks(
	functionNode: FunctionWithBlockBody,
	matchesResult: MatchingHooksResult,
) {
	for (const beforeHook of matchesResult.beforeHooks.reverse()) {
		functionNode.body.body.unshift(
			types.expressionStatement(
				callHookExpression(
					beforeHook,
					functionNode.params as Array<babel.Identifier>,
				),
			),
		);
	}
}

function assert(value: boolean, message: string) {
	if (!value) {
		throw new Error(message);
	}
}

function createInternalFunctionFromBody(
	name: string,
	params: Array<babel.Identifier>,
	body: babel.BlockStatement,
): babel.VariableDeclaration {
	return types.variableDeclaration("const", [
		types.variableDeclarator(
			types.identifier(name),
			types.arrowFunctionExpression(params, body),
		),
	]);
}

function callHookExpression(
	hook: Hook,
	params: Array<babel.Identifier>,
	additionalParams: babel.Identifier[] = [],
): babel.CallExpression {
	const id = hookManager.hookIndex(hook);
	const hookArgs: babel.Expression[] = [
		types.numericLiteral(id),
		types.thisExpression(),
		types.arrayExpression(params),
	];
	if (additionalParams.length !== 0) {
		hookArgs.push(...additionalParams);
	}

	return types.callExpression(
		types.memberExpression(
			types.identifier("HookManager"),
			types.identifier("callHook"),
		),
		hookArgs,
	);
}

function asyncHookThenExpression(
	hook: Hook,
	params: Array<babel.Identifier>,
	thenValue: babel.Identifier,
): babel.FunctionExpression {
	return types.functionExpression(
		null,
		[thenValue],
		types.blockStatement([
			types.expressionStatement(callHookExpression(hook, params, [thenValue])),
			types.returnStatement(thenValue),
		]),
	);
}

function callOriginalFunctionExpression(
	name: string,
	params: Array<babel.Identifier>,
): babel.CallExpression {
	return types.callExpression(
		types.memberExpression(types.identifier(name), types.identifier("call")),
		[types.thisExpression(), ...params],
	);
}
