/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

const fuzz = require("./fuzz.js");

describe("Jest", () => {
	it.fuzz("Sync", fuzz.SIGINT_SYNC);
	it.fuzz("Sync endless loop", fuzz.SIGINT_SYNC_endless_loop);
	it.fuzz("Async", fuzz.SIGINT_ASYNC);
	it.fuzz("Async endless loop", fuzz.SIGINT_ASYNC_endless_loop);
});
