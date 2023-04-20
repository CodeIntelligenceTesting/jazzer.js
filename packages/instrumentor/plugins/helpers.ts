import { NumericLiteral } from "@babel/types";
import { types } from "@babel/core";
import * as crypto from "crypto";

export function nextFakePC(): number {
	return crypto.randomInt(512);
}

export function fakePC(): NumericLiteral {
	return types.numericLiteral(nextFakePC());
}
