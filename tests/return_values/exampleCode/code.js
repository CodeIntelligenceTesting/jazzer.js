const ReturnType = {
	SYNC: "sync",
	ASYNC: "async",
	MIXED: "mixed",
};

exports.ReturnType = ReturnType;

/**
 * @param {number} n
 */
exports.encrypt = function encrypt(n, return_type) {
	const ret = n ^ 0x11223344;
	switch (return_type) {
		case ReturnType.SYNC:
			return ret;
		case ReturnType.ASYNC:
			return new Promise((resolve) => {
				setImmediate(() => {
					resolve(ret);
				});
			});
		case ReturnType.MIXED: {
			const syncOrAsync = Math.random() >= 0.5;
			// Synchronous result
			if (syncOrAsync) {
				return ret;
			} else {
				// Asynchronous result
				return new Promise((resolve) => {
					setImmediate(() => {
						resolve(ret);
					});
				});
			}
		}
		default:
			return ret;
	}
};
