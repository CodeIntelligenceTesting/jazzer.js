module.exports.fuzzMe = function (data) {
	const s = data.toString();
	if (s.length !== 16) {
		return;
	}
	if (
		s.slice(0, 8) === "Awesome " &&
		s.slice(8, 15) === "Fuzzing" &&
		s[15] === "!"
	) {
		throw Error("Welcome to Awesome Fuzzing!");
	}
};
