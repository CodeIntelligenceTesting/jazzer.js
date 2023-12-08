/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import * as crypto from "crypto";

import { types } from "@babel/core";
import { NumericLiteral } from "@babel/types";

export function fakePC(): NumericLiteral {
	return types.numericLiteral(crypto.randomInt(512));
}
