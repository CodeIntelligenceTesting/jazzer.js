function foo(a) {
	console.log("original foo");
	if (a > 10) {
		return 5;
	}
	return 42;
}

module.exports = {
	foo,
};
