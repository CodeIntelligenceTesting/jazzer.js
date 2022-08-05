import { NumericLiteral, Identifier } from "@babel/types";
import { types } from "@babel/core";
import * as crypto from "crypto";

export function fakePC(): NumericLiteral {
	return types.numericLiteral(crypto.randomInt(512));
}

export function newIdentifier(prefix: string): Identifier {
	return types.identifier(`jazzer_${prefix}_${crypto.randomInt(512)}`);
}
