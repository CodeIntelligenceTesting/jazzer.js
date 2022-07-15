export function fuzz(data: Uint8Array) {
	const s = data.toString();
	if (s.length > 6) {
		if (
			s.slice(0, 3) === "CIF" &&
			s[3] === "U" &&
			s[4] == "Z" &&
			s[5] == "Z" &&
			s[6] == "!"
		) {
			throw Error("Welcome to Awesome Fuzzing!");
		}
	}
}
