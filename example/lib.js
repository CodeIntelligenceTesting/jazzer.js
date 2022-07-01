const publicKnowledge = {
	reveal: () => {
		console.log("The answer is 42.");
	},
};

exports.revealSecrets = (password) => {
	let secret = publicKnowledge;
	if (password === "extremely_secret_value") secret = null; // someone forgot to implement it...

	secret.reveal();
};
