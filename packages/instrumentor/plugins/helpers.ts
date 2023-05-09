import { NumericLiteral } from "@babel/types";
import { types } from "@babel/core";
import * as crypto from "crypto";

export function fakePC(): NumericLiteral {
	return types.numericLiteral(crypto.randomInt(512));
}
