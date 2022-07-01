/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

// TODO: Pass request for next counter to native plugin
let counter = 0;
export function nextCounter(): number {
	return counter++;
}

// TODO: incrementCounter applies the never-zero policy
// noinspection JSUnusedLocalSymbols
export function incrementCounter(id: number) {}
