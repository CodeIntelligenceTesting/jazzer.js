/*
 * Copyright 2026 Code Intelligence GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from "fs";
import * as os from "os";
import process from "process";

import * as lock from "proper-lockfile";

import { fuzzer } from "@jazzer.js/fuzzer";

if (process.listeners) {
	// "signal-exit" library imported by "proper-lockfile" inserts listeners
	// for all important signals, such as SIGALRM and SIGINT
	// (see https://github.com/tapjs/signal-exit/blob/39a5946d2b04d00106400c0dcc5d358a40892438/signals.js)
	// libFuzzer has a SIGALRM handler to deal with -timeout flag, here we give
	// the control back to libFuzzer by removing the SIGALRM listeners inserted by "signal-exit".
	if (process.listeners("SIGALRM").length > 0) {
		process.removeListener("SIGALRM", process.listeners("SIGALRM")[0]);
	}
	// SIGINT: in synchronous mode, pressing CTRL-C does not abort the process.
	// Removing the SIGINT listener inserted by "signal-exit" gives the control back to the users.
	if (process.listeners("SIGINT").length > 0) {
		process.removeListener("SIGINT", process.listeners("SIGINT")[0]);
	}
}

export interface EdgeIdStrategy {
	nextEdgeId(): number;
	reserveEdgeRange(filename: string, idCount: number): number;
	startForSourceFile(filename: string): void;
	commitIdCount(filename: string): void;
}

export abstract class IncrementingEdgeIdStrategy implements EdgeIdStrategy {
	protected constructor(protected _nextEdgeId: number) {}

	nextEdgeId(): number {
		fuzzer.coverageTracker.enlargeCountersBufferIfNeeded(this._nextEdgeId);
		return this._nextEdgeId++;
	}

	reserveEdgeRange(_filename: string, idCount: number): number {
		if (!Number.isInteger(idCount) || idCount < 0) {
			throw new Error(`Invalid edge count: ${idCount}`);
		}
		const firstId = this._nextEdgeId;
		this._nextEdgeId += idCount;
		return firstId;
	}

	abstract startForSourceFile(filename: string): void;
	abstract commitIdCount(filename: string): void;
}

export class MemorySyncIdStrategy extends IncrementingEdgeIdStrategy {
	constructor() {
		super(0);
	}

	startForSourceFile(filename: string): void {
		// nothing to do here
	}

	commitIdCount(filename: string) {
		// nothing to do here
	}
}

interface EdgeIdInfo {
	filename: string;
	firstId: number;
	idCount: number;
}

function parseIdInfoLine(line: string): EdgeIdInfo {
	const parts = line.split(",");
	if (parts.length !== 3) {
		throw new Error(
			`Expected ID file line to be <file>,<first ID>,<num IDs>, got ` +
				`"${line}"`,
		);
	}
	return {
		filename: parts[0],
		firstId: parseInt(parts[1], 10),
		idCount: parseInt(parts[2], 10),
	};
}

function nextFreeId(idInfo: EdgeIdInfo[]): number {
	if (idInfo.length === 0) {
		return 0;
	}
	const last = idInfo[idInfo.length - 1];
	return last.firstId + last.idCount;
}

/**
 * A strategy for edge ID generation that synchronizes the IDs assigned to a source file
 * with other processes via the specified `idSyncFile`. The edge information stored as a
 * line of the format: <source file path>,<initial edge ID>,<total edge count>
 *
 * This class takes care of synchronizing the access to the file between
 * multiple processes accessing it during instrumentation.
 */
export class FileSyncIdStrategy extends IncrementingEdgeIdStrategy {
	private static readonly fatalExitCode = 79;
	private cachedIdCount: number | undefined;
	private firstEdgeId: number | undefined;
	private releaseLockOnSyncFile: (() => void) | undefined;

	constructor(private idSyncFile: string) {
		super(0);
	}

	startForSourceFile(filename: string): void {
		const idInfo = this.acquireLockAndReadIdInfo();
		const idInfoForFile = idInfo.filter((info) => info.filename === filename);

		switch (idInfoForFile.length) {
			case 0:
				// Keep the lock until commitIdCount() records the final range.
				this.firstEdgeId = nextFreeId(idInfo);
				this.cachedIdCount = undefined;
				break;
			case 1:
				this.firstEdgeId = idInfoForFile[0].firstId;
				this.cachedIdCount = idInfoForFile[0].idCount;
				this.releaseLock();
				break;
			default:
				this.releaseLock();
				console.error(
					`ERROR: Multiple entries for ${filename} in ID sync file`,
				);
				process.exit(FileSyncIdStrategy.fatalExitCode);
		}

		this._nextEdgeId = this.firstEdgeId;
	}

	reserveEdgeRange(filename: string, idCount: number): number {
		const idInfo = this.acquireLockAndReadIdInfo();
		try {
			const idInfoForFile = idInfo.filter((info) => info.filename === filename);
			switch (idInfoForFile.length) {
				case 0: {
					const firstId = nextFreeId(idInfo);
					fs.appendFileSync(
						this.idSyncFile,
						`${filename},${firstId},${idCount}${os.EOL}`,
					);
					this._nextEdgeId = Math.max(this._nextEdgeId, firstId + idCount);
					return firstId;
				}
				case 1:
					if (idInfoForFile[0].idCount !== idCount) {
						throw new Error(
							`${filename} has ${idCount} edges, but ` +
								`${idInfoForFile[0].idCount} edges reserved in ` +
								"ID sync file",
						);
					}
					this._nextEdgeId = Math.max(
						this._nextEdgeId,
						idInfoForFile[0].firstId + idCount,
					);
					return idInfoForFile[0].firstId;
				default:
					console.error(
						`ERROR: Multiple entries for ${filename} in ID sync file`,
					);
					process.exit(FileSyncIdStrategy.fatalExitCode);
			}
		} finally {
			this.releaseLock();
		}
	}

	commitIdCount(filename: string): void {
		if (this.firstEdgeId === undefined) {
			throw Error("commitIdCount() is called before startForSourceFile()");
		}

		const usedIdsCount = this._nextEdgeId - this.firstEdgeId;
		if (this.cachedIdCount !== undefined) {
			// We released the lock already in startForSourceFile since the file had already been instrumented
			// elsewhere. As we know the expected number of IDs for the current source file in this case, check
			// for deviations.
			if (this.cachedIdCount !== usedIdsCount) {
				throw Error(
					`${filename} has ${usedIdsCount} edges, but ${this.cachedIdCount} edges reserved in ID sync file`,
				);
			}
		} else {
			if (this.releaseLockOnSyncFile === undefined) {
				console.error(
					`ERROR: Lock on ID sync file is not acquired by the first processing instrumenting: ${filename}`,
				);
				process.exit(FileSyncIdStrategy.fatalExitCode);
			}

			// We are the first to instrument this file and should record the number of IDs in the sync file.
			fs.appendFileSync(
				this.idSyncFile,
				`${filename},${this.firstEdgeId},${usedIdsCount}${os.EOL}`,
			);
			this.releaseLock();
			this.firstEdgeId = undefined;
			this.cachedIdCount = undefined;
		}
	}

	private acquireLockAndReadIdInfo(): EdgeIdInfo[] {
		for (;;) {
			if (lock.checkSync(this.idSyncFile)) {
				this.wait(this.randomIntFromInterval(0, 100));
				continue;
			}
			try {
				this.releaseLockOnSyncFile = lock.lockSync(this.idSyncFile);
				return fs
					.readFileSync(this.idSyncFile, "utf8")
					.toString()
					.split(os.EOL)
					.filter((line) => line.length !== 0)
					.map(parseIdInfoLine);
			} catch (e) {
				if (this.isLockAlreadyHeldError(e)) {
					continue;
				}
				this.releaseLock();
				throw e;
			}
		}
	}

	private releaseLock() {
		if (this.releaseLockOnSyncFile !== undefined) {
			this.releaseLockOnSyncFile();
			this.releaseLockOnSyncFile = undefined;
		}
	}

	private wait(timeout: number) {
		// This is a workaround to synchronously sleep for a `timout` milliseconds.
		// The static Atomics.wait() method verifies that a given position in an Int32Array
		// still contains a given value and if so sleeps, awaiting a wakeup or a timeout.
		// Here, we deliberately cause a timeout.
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, timeout);
	}

	private randomIntFromInterval(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1) + min);
	}

	private isLockAlreadyHeldError(e: unknown): boolean {
		return (
			e != null && typeof e === "object" && "code" in e && e.code === "ELOCKED"
		);
	}
}

export class ZeroEdgeIdStrategy implements EdgeIdStrategy {
	nextEdgeId(): number {
		return 0;
	}

	reserveEdgeRange(_filename: string, _idCount: number): number {
		return 0;
	}

	startForSourceFile(filename: string): void {
		// Nothing to do here
	}

	commitIdCount(filename: string): void {
		// Nothing to do here
	}
}
