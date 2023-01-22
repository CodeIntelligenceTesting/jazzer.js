/*
 * Copyright 2023 Code Intelligence GmbH
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

import * as lock from "proper-lockfile";
import * as fs from "fs";
import * as os from "os";
import process from "process";

import { fuzzer } from "@jazzer.js/fuzzer";

export abstract class EdgeIdStrategy {
	protected constructor(protected _nextEdgeId: number) {}

	nextEdgeId(): number {
		fuzzer.enlargeCountersBufferIfNeeded(this._nextEdgeId);
		return this._nextEdgeId++;
	}

	abstract startForSourceFile(filename: string): void;
	abstract commitIdCount(filename: string): void;
}

export class MemorySyncIdStrategy extends EdgeIdStrategy {
	constructor() {
		super(0);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	startForSourceFile(filename: string): void {
		// nothing to do here
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	commitIdCount(filename: string) {
		// nothing to do here
	}
}

interface EdgeIdInfo {
	filename: string;
	firstId: number;
	idCount: number;
}

/**
 * A strategy for edge ID generation that synchronizes the IDs assigned to a source file
 * with other processes via the specified `idSyncFile`. The edge information stored as a
 * line of the format: <source file path>,<initial edge ID>,<total edge count>
 *
 * This class takes care of synchronizing the access to the file between
 * multiple processes accessing it during instrumentation.
 */
export class FileSyncIdStrategy extends EdgeIdStrategy {
	private cachedIdCount: number | undefined;
	private firstEdgeId: number | undefined;

	constructor(private idSyncFile: string) {
		super(0);
	}

	startForSourceFile(filename: string): void {
		// We resort to busy waiting since the `Transformer` required by istanbul's `hookRequire`
		// must be a synchronous function returning the transformed code.
		for (;;) {
			const isLocked = lock.checkSync(this.idSyncFile);
			if (isLocked) {
				// If the ID sync file is already locked, wait for a random period of time
				// between 0 and 100 milliseconds. Waiting for different periods reduces
				// the chance of all processes wanting to acquire the lock at the same time.
				this.wait(this.randomIntFromInterval(0, 100));
				continue;
			}
			try {
				// Acquire the lock for the ID sync file and look for the initial edge ID and
				// corresponding number of inserted counters.
				lock.lockSync(this.idSyncFile);
				const idInfo = fs
					.readFileSync(this.idSyncFile, "utf8")
					.toString()
					.split(os.EOL)
					.filter((line) => line.length !== 0)
					.map((line): EdgeIdInfo => {
						const parts = line.split(",");
						if (parts.length !== 3) {
							lock.unlockSync(this.idSyncFile);
							throw Error(
								`Expected ID file line to be of the form <source file>,<first ID>,<num IDs>", got "${line}"`
							);
						}
						return {
							filename: parts[0],
							firstId: parseInt(parts[1], 10),
							idCount: parseInt(parts[2], 10),
						};
					});
				const idInfoForFile = idInfo.filter(
					(info) => info.filename === filename
				);

				switch (idInfoForFile.length) {
					case 0:
						// We are the first to encounter this source file and thus need to hold the lock
						// until the file has been instrumented and we know the required number of edge IDs.
						//
						// Compute the next free ID as the maximum over the sums of first ID and ID count, starting at 0 if
						// this is the first ID to be assigned. Since this is the only way new lines are added to
						// the file, the maximum is always attained by the last line.
						this.firstEdgeId =
							idInfo.length !== 0
								? idInfo[idInfo.length - 1].firstId +
								  idInfo[idInfo.length - 1].idCount
								: 0;
						break;
					case 1:
						// This source file has already been instrumented elsewhere, so we just return the first ID and
						// ID count reported from there and release the lock right away. The caller is still expected
						// to call commitIdCount.
						this.firstEdgeId = idInfoForFile[0].firstId;
						this.cachedIdCount = idInfoForFile[0].idCount;
						lock.unlockSync(this.idSyncFile);
						break;
					default:
						lock.unlockSync(this.idSyncFile);
						throw Error(`Multiple entries for ${filename} in ID sync file`);
				}
				break;
			} catch (e) {
				// Retry to wait for the lock to be release it is acquired by another process
				// in the time window between last successful check and trying to acquire it.
				if (this.isLockAlreadyHeldError(e)) {
					continue;
				}

				// Stop waiting for the lock if we encounter other errors. Also, rethrow the error.
				throw e;
			}
		}

		this._nextEdgeId = this.firstEdgeId;
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
					`${filename} has ${usedIdsCount} edges, but ${this.cachedIdCount} edges reserved in ID sync file`
				);
			}
		} else {
			// We are the first to instrument this file and should record the number of IDs in the sync file.
			fs.appendFileSync(
				this.idSyncFile,
				`${filename},${this.firstEdgeId},${usedIdsCount}${os.EOL}`
			);
			this.firstEdgeId = undefined;
			this.cachedIdCount = undefined;
			lock.unlockSync(this.idSyncFile);
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
