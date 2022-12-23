import proto from "protobufjs";
import { temporaryWriteSync } from "tempy";

/**
 * @param { Buffer } data
 */
export function fuzz(data) {
	try {
		const file = temporaryWriteSync(data);
		const root = proto.loadSync(file);
		if (root.toString().length >= 30) {
			console.log("== Input: " + data.toString() + "\n== " + root.toString());
		}
	} catch (e) {
		if (
			e.name !== "SyntaxError" &&
			e.message &&
			!e.message.includes("illegal token") &&
			!e.message.includes("illegal string") &&
			!e.message.includes("illegal path") &&
			!e.message.includes("illegal comment") &&
			!e.message.includes("illegal reference") &&
			!e.message.includes("illegal name") &&
			!e.message.includes("illegal type") &&
			!e.message.includes("illegal value") &&
			!e.message.includes("illegal service") &&
			!e.message.includes("name must be a string") &&
			!e.message.includes("path must be relative") &&
			!e.message.includes("duplicate name") &&
			!e.message.includes("Unexpected token") &&
			!e.message.includes("Unexpected end")
		) {
			throw e;
		}
	}
}
