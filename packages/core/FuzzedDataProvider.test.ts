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

import { FuzzedDataProvider } from "./FuzzedDataProvider";

describe("FuzzedDataProvider checks", () => {
	it("remainingBytes", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.remainingBytes).toBe(1024);
		data.consumeBoolean();
		expect(data.remainingBytes).toBe(1023);
		data.consumeBoolean();
		data.consumeBoolean();
		expect(data.remainingBytes).toBe(1021);
		data.consumeBoolean();
		expect(data.remainingBytes).toBe(1020);
		data.consumeIntegral(1);
		expect(data.remainingBytes).toBe(1019);
	});

	it("consumeBooleans", () => {
		const data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeBooleans(1.5);
		}).toThrow("length value must be an integer");
		expect(data.consumeBooleans(5)).toStrictEqual([
			false,
			true,
			true,
			false,
			true,
		]);
		expect(data.remainingBytes).toBe(1019);
		data.consumeNumber();
		expect(data.remainingBytes).toBe(1011);
		expect(data.consumeBooleans(5)).toStrictEqual([
			true,
			false,
			false,
			true,
			false,
		]);
		expect(data.remainingBytes).toBe(1006);
		data.consumeBooleans(1000);
		expect(data.remainingBytes).toBe(6);
		expect(data.consumeBooleans(10)).toStrictEqual([
			true,
			true,
			true,
			false,
			false,
			true,
		]);
	});

	it("consumeIntegralInRange", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeIntegralInRange(0, 255)).toBe(0x4a);
		expect(data.remainingBytes).toBe(1023);
		expect(() => {
			data.consumeIntegralInRange(0, 2 ** 48);
		}).toThrow();
		expect(() => {
			data.consumeIntegralInRange(2 ** 53 - 2, 2 ** 53);
		}).toThrow();
		expect(() => {
			data.consumeIntegralInRange(1, 0);
		}).toThrow();
		for (let i = 0; i < 1020; i++) {
			data.consumeIntegralInRange(0, 1);
		}
		expect(data.remainingBytes).toBe(3);
		expect(data.consumeIntegralInRange(0, 2 ** 32)).toBe(0x0d198a);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeBigIntegralInRange", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeBigIntegralInRange(BigInt(0), BigInt(255))).toBe(
			BigInt(0x4a),
		);
		expect(data.remainingBytes).toBe(1023);
		expect(() => {
			data.consumeBigIntegralInRange(BigInt(1), BigInt(0));
		}).toThrow();
		for (let i = 0; i < 1020; i++) {
			data.consumeBigIntegralInRange(BigInt(0), BigInt(1));
		}
		expect(data.remainingBytes).toBe(3);
		expect(
			data.consumeBigIntegralInRange(
				BigInt(0),
				BigInt("0xffffffffffffffffffff"),
			),
		).toBe(BigInt(0x0d198a));
		expect(data.remainingBytes).toBe(0);
		expect(
			data.consumeBigIntegralInRange(
				BigInt(0),
				BigInt("0xffffffffffffffffffff"),
			),
		).toBe(BigInt(0));
	});

	it("consumeByte", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeIntegral(1)).toBe(0x4a);
		expect(data.remainingBytes).toBe(1023);
		expect(data.consumeIntegral(1)).toBe(0x29);
		expect(data.remainingBytes).toBe(1022);
		expect(data.consumeIntegral(1)).toBe(0x3d);
		expect(data.remainingBytes).toBe(1021);
		expect(data.consumeIntegral(1)).toBe(0xcf);
		expect(data.remainingBytes).toBe(1020);
		expect(data.consumeIntegral(1)).toBe(0x16);
		expect(data.remainingBytes).toBe(1019);
		expect(data.consumeIntegral(1)).toBe(0x39);
		expect(data.remainingBytes).toBe(1018);
		expect(data.consumeIntegral(1)).toBe(0x73);
		expect(data.remainingBytes).toBe(1017);
		expect(data.consumeIntegral(1)).toBe(0x43);
		expect(data.remainingBytes).toBe(1016);
		expect(data.consumeIntegral(1)).toBe(0x3d);
		expect(data.remainingBytes).toBe(1015);
		expect(data.consumeIntegral(1)).toBe(0xd6);
		expect(data.remainingBytes).toBe(1014);
		expect(data.consumeIntegral(1)).toBe(0x54);
		expect(data.remainingBytes).toBe(1013);
		expect(data.consumeIntegral(1)).toBe(0xfd);
		expect(data.remainingBytes).toBe(1012);
		expect(data.consumeIntegral(1)).toBe(0x4d);
		expect(data.remainingBytes).toBe(1011);
	});

	it("consumeIntegralInRange", () => {
		const data = new FuzzedDataProvider(Data);
		// testing ranges of a byte
		expect(data.consumeIntegralInRange(0, 255)).toBe(0x4a);
		expect(data.remainingBytes).toBe(1023);
		expect(data.consumeIntegralInRange(0, 255)).toBe(0x29);
		expect(data.remainingBytes).toBe(1022);
		expect(data.remainingBytes).toBe(1022);
		expect(() => {
			data.consumeIntegralInRange(1, 0);
		}).toThrow();
		expect(data.remainingBytes).toBe(1022);
		expect(data.consumeIntegralInRange(0, 255)).toBe(0x3d);
		expect(data.remainingBytes).toBe(1021);
		// testing other ranges starting from 0
		expect(data.consumeIntegralInRange(0, 10)).toBe(0xcf % 11);
		expect(data.remainingBytes).toBe(1020);
		expect(data.consumeIntegralInRange(0, 20)).toBe(0x16 % 21);
		expect(data.remainingBytes).toBe(1019);
		expect(data.consumeIntegralInRange(0, 0)).toBe(0);
		expect(data.remainingBytes).toBe(1019);
		expect(data.consumeIntegralInRange(0, 1)).toBe(1);
		expect(data.remainingBytes).toBe(1018);
		// testing ranges starting from arbitrary numbers
		expect(data.consumeIntegralInRange(13, 30)).toBe((0x73 % 18) + 13);
		expect(data.remainingBytes).toBe(1017);
	});

	it("consumeIntegrals on the whole array", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeIntegrals(Data.length, 1)).toStrictEqual([...Data]);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeBytes", () => {
		const data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeBytes(1.5);
		}).toThrow("length value must be an integer");
		expect(data.consumeBytes(4)).toStrictEqual([0x8a, 0x19, 0x0d, 0x44]);
		expect(data.remainingBytes).toBe(1020);
		expect(data.consumeBytes(3)).toStrictEqual([0x37, 0x0d, 0x38]);
		expect(data.remainingBytes).toBe(1017);
	});

	it("consumeRemainingBytes on the whole array: ", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeRemainingAsBytes()).toStrictEqual([...Data]);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeRemainingBytes", () => {
		const data = new FuzzedDataProvider(Data);
		data.consumeBytes(1014);
		expect(data.remainingBytes).toBe(10);
		data.consumeIntegral(1);
		expect(data.remainingBytes).toBe(9);
		expect(data.consumeRemainingAsBytes()).toStrictEqual([
			0xd6, 0x3d, 0x43, 0x73, 0x39, 0x16, 0xcf, 0x3d, 0x29,
		]);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeIntegrals", () => {
		const data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeIntegrals(1.5, 1);
		}).toThrow("length value must be an integer");
		expect(() => {
			data.consumeIntegrals(2, 1.5);
		}).toThrow("length value must be an integer");
		expect(data.consumeIntegrals(2, 1)).toStrictEqual([0x8a, 0x19]);
		expect(data.remainingBytes).toBe(1022);
		expect(data.consumeIntegrals(2, 2)).toStrictEqual([0x0d44, 0x370d]);
		expect(data.remainingBytes).toBe(1018);
		expect(data.consumeIntegrals(3, 4)).toStrictEqual([
			0x385e9baa, 0xf3daaa88, 0xf29b6cba,
		]);
		expect(data.remainingBytes).toBe(1006);
		expect(data.consumeIntegrals(4, 4)).toStrictEqual([
			0xbeb1f2cf, 0x13b8ac1a, 0x7f1cc990, 0xd0d95c42,
		]);
		expect(data.remainingBytes).toBe(990);
		expect(data.consumeIntegrals(1, 4)).toStrictEqual([0xb3fde305]);
		expect(data.remainingBytes).toBe(986);
		expect(data.consumeIntegrals(11, 1)).toStrictEqual([
			0xa4, 0x03, 0x37, 0x49, 0x50, 0x4b, 0xbc, 0x39, 0xa2, 0x09, 0x6c,
		]);
		expect(data.remainingBytes).toBe(975);
		expect(data.consumeBigIntegrals(2, 8)).toStrictEqual([
			BigInt("0x2fafd1b547bf92bd"),
			BigInt("0x79e5c56e51a4ede9"),
		]);
		expect(data.remainingBytes).toBe(959);
	});

	it("consumeIntegrals boundaries", () => {
		// testing boundaries
		let data = new FuzzedDataProvider(Data);
		data.consumeBytes(1020);
		expect(data.remainingBytes).toBe(4);
		expect(data.consumeIntegrals(1, 4)).toStrictEqual([0xcf3d294a]);
		// reading uint32 from 3 available bytes
		data = new FuzzedDataProvider(Buffer.from([0x01, 0x02, 0x03]));
		expect(data.consumeIntegrals(1, 4)).toStrictEqual([0x010203]);
		expect(data.remainingBytes).toBe(0);
		// reading uint32 from 2 available bytes
		data = new FuzzedDataProvider(Buffer.from([0x01, 0x02]));
		expect(data.consumeIntegrals(1, 4)).toStrictEqual([0x0102]);
		expect(data.remainingBytes).toBe(0);
		// reading uint32 from 1 available byte
		data = new FuzzedDataProvider(Buffer.from([0x01]));
		expect(data.consumeIntegrals(1, 4)).toStrictEqual([0x01]);
		expect(data.remainingBytes).toBe(0);

		// reading uint64 from 7 available bytes
		data = new FuzzedDataProvider(Buffer.from([1, 2, 3, 4, 5, 6, 7]));
		expect(data.consumeBigIntegrals(1, 8)).toStrictEqual([
			Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]).readBigUInt64BE(),
		]);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeIntegrals signed", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeIntegrals(4, 1, true)).toStrictEqual([
			0x8a - 128,
			0x19 - 128,
			0x0d - 128,
			0x44 - 128,
		]);
		expect(data.remainingBytes).toBe(1020);
		expect(data.consumeIntegrals(4, 2, true)).toStrictEqual([
			0x370d - 2 ** 15,
			0x385e - 2 ** 15,
			0x9baa - 2 ** 15,
			0xf3da - 2 ** 15,
		]);
		expect(data.remainingBytes).toBe(1012);
		expect(data.consumeIntegrals(4, 3, true)).toStrictEqual([
			0xaa88f2 - 2 ** 23,
			0x9b6cba - 2 ** 23,
			0xbeb1f2 - 2 ** 23,
			0xcf13b8 - 2 ** 23,
		]);
		expect(data.remainingBytes).toBe(1000);
		data.consumeBytes(990);
		expect(data.remainingBytes).toBe(10);
		expect(data.consumeIntegrals(4, 4, true)).toStrictEqual([
			0xd63d4373 - 2 ** 31,
			0x3916cf3d - 2 ** 31,
			0x294a - 2 ** 31,
		]);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeBigIntegrals", () => {
		let data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeBigIntegrals(1.5, 1);
		}).toThrow("length value must be an integer");
		expect(() => {
			data.consumeBigIntegrals(2, 1.5);
		}).toThrow("length value must be an integer");
		expect(data.consumeBigIntegrals(2, 1)).toStrictEqual([
			BigInt(0x8a),
			BigInt(0x19),
		]);
		expect(data.remainingBytes).toBe(1022);
		expect(data.consumeBigIntegrals(2, 2)).toStrictEqual([
			BigInt(0x0d44),
			BigInt(0x370d),
		]);
		expect(data.remainingBytes).toBe(1018);
		expect(data.consumeBigIntegrals(3, 4)).toStrictEqual([
			BigInt(0x385e9baa),
			BigInt(0xf3daaa88),
			BigInt(0xf29b6cba),
		]);
		expect(data.remainingBytes).toBe(1006);
		expect(data.consumeBigIntegrals(4, 4)).toStrictEqual([
			BigInt(0xbeb1f2cf),
			BigInt(0x13b8ac1a),
			BigInt(0x7f1cc990),
			BigInt(0xd0d95c42),
		]);
		expect(data.remainingBytes).toBe(990);
		expect(data.consumeBigIntegrals(1, 4)).toStrictEqual([BigInt(0xb3fde305)]);
		expect(data.remainingBytes).toBe(986);
		expect(data.consumeBigIntegrals(11, 1)).toStrictEqual(
			[0xa4, 0x03, 0x37, 0x49, 0x50, 0x4b, 0xbc, 0x39, 0xa2, 0x09, 0x6c].map(
				BigInt,
			),
		);
		expect(data.remainingBytes).toBe(975);
		expect(data.consumeBigIntegrals(2, 8)).toStrictEqual([
			BigInt("0x2fafd1b547bf92bd"),
			BigInt("0x79e5c56e51a4ede9"),
		]);
		expect(data.remainingBytes).toBe(959);
		data = new FuzzedDataProvider(Data);
		data.consumeBytes(1020);
		expect(data.remainingBytes).toBe(4);
		expect(data.consumeBigIntegrals(1, 4)).toStrictEqual([BigInt(0xcf3d294a)]);
	});

	it("consumeBigIntegrals signed", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeBigIntegrals(4, 1, true)).toStrictEqual(
			[0x8a - 128, 0x19 - 128, 0x0d - 128, 0x44 - 128].map(BigInt),
		);
		expect(data.remainingBytes).toBe(1020);
		expect(data.consumeBigIntegrals(4, 2, true)).toStrictEqual(
			[
				0x370d - 2 ** 15,
				0x385e - 2 ** 15,
				0x9baa - 2 ** 15,
				0xf3da - 2 ** 15,
			].map(BigInt),
		);
		expect(data.remainingBytes).toBe(1012);
		expect(data.consumeBigIntegrals(4, 3, true)).toStrictEqual(
			[
				0xaa88f2 - 2 ** 23,
				0x9b6cba - 2 ** 23,
				0xbeb1f2 - 2 ** 23,
				0xcf13b8 - 2 ** 23,
			].map(BigInt),
		);
		expect(data.remainingBytes).toBe(1000);
		data.consumeBytes(990);
		expect(data.remainingBytes).toBe(10);
		expect(data.consumeBigIntegrals(4, 4, true)).toStrictEqual(
			[0xd63d4373 - 2 ** 31, 0x3916cf3d - 2 ** 31, 0x294a - 2 ** 31].map(
				BigInt,
			),
		);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeBytes (tests from libfuzzer)", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeBytes(1)).toStrictEqual([0x8a]);
		expect(data.consumeBytes(10)).toStrictEqual([
			0x19, 0x0d, 0x44, 0x37, 0x0d, 0x38, 0x5e, 0x9b, 0xaa, 0xf3,
		]);
		expect(data.consumeBytes(24)).toStrictEqual([
			0xda, 0xaa, 0x88, 0xf2, 0x9b, 0x6c, 0xba, 0xbe, 0xb1, 0xf2, 0xcf, 0x13,
			0xb8, 0xac, 0x1a, 0x7f, 0x1c, 0xc9, 0x90, 0xd0, 0xd9, 0x5c, 0x42, 0xb3,
		]);
		expect(data.consumeBytes(31337)).toStrictEqual([
			...Data.slice(1 + 10 + 24, Data.length),
		]);
	});

	it("consumeIntInRange (tests from libfuzzer)", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeIntegralInRange(10, 30)).toBe(21);
		expect(data.consumeIntegralInRange(1337, 1337)).toBe(1337);
		expect(data.consumeIntegralInRange(-100, 100)).toBe(-59);
		expect(data.consumeIntegralInRange(0, 65535)).toBe(15823);
		expect(data.consumeIntegralInRange(-123, 123)).toBe(-101);
		expect(
			data.consumeBigIntegralInRange(BigInt(-99999999999), BigInt(99999999999)),
		).toBe(BigInt(-53253077544));
		const str = data.consumeString(31337);
		expect(str.length).toBe(1014);
		expect(data.consumeIntegralInRange(123456789, 987654321)).toBe(123456789);
	});

	it("consumeIntegral (tests from libfuzzer)", () => {
		const data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeIntegral(1.5);
		}).toThrow("length value must be an integer");
		expect(data.consumeIntegral(4, true)).toBe(-903266865);
		expect(data.remainingBytes).toBe(1020);
		expect(data.consumeIntegral(4)).toBe(372863811);
		expect(data.remainingBytes).toBe(1016);
		expect(data.consumeIntegral(1)).toBe(61);
		expect(data.remainingBytes).toBe(1015);
		expect(data.consumeIntegral(2, true)).toBe(22100);
		expect(data.remainingBytes).toBe(1013);
		expect(data.consumeBigIntegral(8, false)).toBe(
			BigInt("0xfd4d113a1ff651f9"),
		);
		expect(data.remainingBytes).toBe(1005);
		// exhaust the buffer
		const str = data.consumeString(31337);
		expect(str.length).toBe(1005);
		expect(data.consumeBigIntegral(8, false)).toBe(BigInt(0));
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeBigIntegral(8, true)).toBe(-BigInt(1) << BigInt(63));
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeBoolean (tests from libfuzzer)", () => {
		let data = new FuzzedDataProvider(Data);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.consumeBoolean()).toBe(false);
		// exhaust the buffer
		const str = data.consumeString(31337);
		expect(str.length).toBe(1014);
		expect(data.consumeBoolean()).toBe(false);

		data = new FuzzedDataProvider(Data);
		for (let i = 0; i < 1014; i++) {
			data.consumeBoolean();
		}
		expect(data.remainingBytes).toBe(10);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(9);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.remainingBytes).toBe(8);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(7);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(6);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.remainingBytes).toBe(5);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.remainingBytes).toBe(4);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(3);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.remainingBytes).toBe(2);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.remainingBytes).toBe(1);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(0);

		data = new FuzzedDataProvider(Data);
		for (let i = 0; i < 1014; i++) {
			data.consumeBoolean();
		}
		data.consumeBytes(6);
		expect(data.remainingBytes).toBe(4);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(3);
		expect(data.consumeBoolean()).toBe(true);
		expect(data.remainingBytes).toBe(2);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(1);
		expect(data.consumeBoolean()).toBe(false);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeProbability (tests from libfuzzer)", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeProbabilityFloat()).toBe(0.28969179449828614);
		expect(data.remainingBytes).toBe(1020);
		expect(data.consumeProbabilityDouble()).toBe(0.086814121166605432);
		expect(data.remainingBytes).toBe(1012);
		expect(data.consumeProbabilityFloat()).toBe(0.30104411377130175);
		expect(data.remainingBytes).toBe(1008);
		expect(data.consumeProbabilityDouble()).toBe(0.96218831486039413);
		expect(data.remainingBytes).toBe(1000);
		expect(data.consumeProbabilityFloat()).toBe(0.6700505727599493);
		expect(data.remainingBytes).toBe(996);
		expect(data.consumeProbabilityDouble()).toBe(0.69210584173832279);
		expect(data.remainingBytes).toBe(988);
		// exhaust the buffer
		const str = data.consumeString(31337);
		expect(str.length).toBe(1024 - 36);
		expect(data.consumeProbabilityFloat()).toBe(0.0);
		expect(data.remainingBytes).toBe(0);
	});

	it("pickValue", () => {
		const data = new FuzzedDataProvider(Data);
		const array: boolean[] = [true, false, false, true, true];
		expect(data.pickValue(array)).toBe(true);
		expect(data.remainingBytes).toBe(1023);
		expect(data.pickValue(array)).toBe(false);
		expect(data.remainingBytes).toBe(1022);
		expect(data.pickValue(array)).toBe(false);
		expect(data.remainingBytes).toBe(1021);
		expect(data.pickValue(array)).toBe(false);
		expect(data.remainingBytes).toBe(1020);
		expect(data.pickValue(array)).toBe(false);
		expect(data.pickValue(array)).toBe(false);
		expect(data.pickValue(array)).toBe(true);
		expect(data.pickValue(array)).toBe(false);
		expect(data.pickValue(array)).toBe(false);
		expect(() => {
			data.pickValue([]);
		}).toThrow();
	});

	it("pickValue (tests from libfuzzer)", () => {
		const data = new FuzzedDataProvider(Data);
		const array = [1, 2, 3, 4, 5];
		expect(data.pickValue(array)).toBe(5);
		expect(data.remainingBytes).toBe(1023);
		expect(data.pickValue(array)).toBe(2);
		expect(data.remainingBytes).toBe(1022);
		expect(data.pickValue(array)).toBe(2);
		expect(data.remainingBytes).toBe(1021);
		expect(data.pickValue(array)).toBe(3);
		expect(data.remainingBytes).toBe(1020);
		expect(data.pickValue(array)).toBe(3);
		expect(data.remainingBytes).toBe(1019);
		expect(data.pickValue(array)).toBe(3);
		expect(data.remainingBytes).toBe(1018);
		expect(data.pickValue(array)).toBe(1);
		expect(data.remainingBytes).toBe(1017);
		expect(data.pickValue(array)).toBe(3);
		expect(data.remainingBytes).toBe(1016);
		expect(data.pickValue(array)).toBe(2);
		expect(data.remainingBytes).toBe(1015);

		const dataArray = [...Data];
		expect(data.pickValue(dataArray)).toBe(0x9d);
		expect(data.remainingBytes).toBe(1013);
		expect(data.pickValue(dataArray)).toBe(0xba);
		expect(data.remainingBytes).toBe(1011);
		expect(data.pickValue(dataArray)).toBe(0x69);
		expect(data.remainingBytes).toBe(1009);
		expect(data.pickValue(dataArray)).toBe(0xd6);
		expect(data.remainingBytes).toBe(1007);

		expect(data.pickValue([1337, 777])).toBe(777);
		expect(data.remainingBytes).toBe(1006);
		expect(data.pickValue([1337, 777])).toBe(777);
		expect(data.remainingBytes).toBe(1005);
		expect(data.pickValue([1337, 777])).toBe(1337);
		expect(data.remainingBytes).toBe(1004);
		expect(data.pickValue([1337, 777])).toBe(777);
		expect(data.remainingBytes).toBe(1003);
		expect(data.pickValue([1337, 777])).toBe(1337);
		expect(data.remainingBytes).toBe(1002);
		expect(data.pickValue([1337, 777])).toBe(777);
		expect(data.remainingBytes).toBe(1001);
		expect(data.pickValue([1337, 777])).toBe(777);
		expect(data.remainingBytes).toBe(1000);

		// exhaust the buffer
		const str = data.consumeString(31337);
		expect(str.length).toBe(1000);
		expect(data.pickValue(dataArray)).toBe(0x8a);
		expect(data.remainingBytes).toBe(0);
	});

	it("pickValues", () => {
		let data = new FuzzedDataProvider(Data);
		let array = [5, 2, 3, 4, 1];
		expect(data.pickValues(array, 1)).toStrictEqual([1]);
		expect(data.remainingBytes).toBe(1023);
		expect(data.pickValues(array, 1)).toStrictEqual([2]);
		expect(data.remainingBytes).toBe(1022);
		expect(data.pickValues(array, 1)).toStrictEqual([2]);
		expect(data.remainingBytes).toBe(1021);
		expect(data.pickValues(array, 1)).toStrictEqual([3]);
		expect(data.remainingBytes).toBe(1020);
		expect(data.pickValues(array, 1)).toStrictEqual([3]);
		expect(data.remainingBytes).toBe(1019);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.remainingBytes).toBe(1015); // don't need fuzzer data to pick the last number
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.remainingBytes).toBe(1011);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.remainingBytes).toBe(1007);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.remainingBytes).toBe(1003);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.remainingBytes).toBe(999);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.remainingBytes).toBe(995);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		// exhaust the buffer
		data.consumeString(31337);
		expect(data.remainingBytes).toBe(0);
		// no need to sort, because the fuzzer data array is empty, so the pickValues
		// function will pick the elements from array in the same order
		expect(data.pickValues(array, 5)).toStrictEqual([5, 2, 3, 4, 1]);
		expect(data.remainingBytes).toBe(0);
		expect(data.pickValues(array, 5)).toStrictEqual([5, 2, 3, 4, 1]);
		expect(data.remainingBytes).toBe(0);
		expect(data.pickValues(array, 5)).toStrictEqual([5, 2, 3, 4, 1]);
		expect(data.remainingBytes).toBe(0);
		expect(data.pickValues(array, 5)).toStrictEqual([5, 2, 3, 4, 1]);
		expect(data.remainingBytes).toBe(0);

		data = new FuzzedDataProvider(Data);
		array = [5, 2, 3, 4, 1];

		expect(data.pickValues(array, 4)).toStrictEqual([1, 2, 3, 4]);
		expect(data.remainingBytes).toBe(1020);
		expect(data.pickValues(array, 4)).toStrictEqual([3, 2, 4, 1]);
		expect(data.remainingBytes).toBe(1016);
		expect(data.pickValues(array, 5).sort()).toStrictEqual([1, 2, 3, 4, 5]);
		expect(data.remainingBytes).toBe(1012);
		expect(data.pickValues(array, 3)).toStrictEqual([3, 2, 4]);
		expect(data.remainingBytes).toBe(1009);
	});

	it("consumeFloat (libfuzzer tests)", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeFloat()).toBe(-2.8546307457582937e38);
		expect(data.remainingBytes).toBe(1019);
		expect(data.consumeDouble()).toBe(8.0940194040236032e307);
		expect(data.remainingBytes).toBe(1010);
		expect(data.consumeFloatInRange(123.0, 777.0)).toBe(271.4908334916669);
		expect(data.remainingBytes).toBe(1006);
		expect(data.consumeNumberInRange(13.37, 31.337)).toBe(30.859126145478349);
		expect(data.remainingBytes).toBe(998);
		expect(data.consumeFloatInRange(-999.9999, -777.77)).toBe(
			-903.4772913756137,
		);
		expect(data.remainingBytes).toBe(994);
		expect(data.consumeNumberInRange(-13.37, 31.337)).toBe(24.561393182922771);
		expect(data.remainingBytes).toBe(986);
		expect(data.consumeFloatInRange(1.0, 1.0)).toBe(1.0);
		expect(data.remainingBytes).toBe(986);
		expect(data.consumeNumberInRange(1.0, 1.0)).toBe(1.0);
		expect(data.remainingBytes).toBe(986);
		// exhaust the buffer
		const str = data.consumeString(31337);
		expect(data.remainingBytes).toBe(0);
		expect(str.length).toBe(Data.length - 38);
		expect(data.consumeProbabilityFloat()).toBe(0.0);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeProbabilityDouble()).toBe(0.0);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeFloat()).toBe(FuzzedDataProvider.min_float);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeFloatInRange(123.0, 777.0)).toBe(123.0);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeNumberInRange(-13.37, 31.337)).toBe(-13.37);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeFloat and consumeDoubleInRange (libfuzzer tests)", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeFloat()).toBe(-2.8546307457582937e38);
		expect(data.remainingBytes).toBe(1019);
		expect(data.consumeDouble()).toBe(8.0940194040236032e307);
		expect(data.remainingBytes).toBe(1010);
		expect(data.consumeFloatInRange(123.0, 777.0)).toBe(271.4908334916669);
		expect(data.remainingBytes).toBe(1006);
		expect(data.consumeDoubleInRange(13.37, 31.337)).toBe(30.859126145478349);
		expect(data.remainingBytes).toBe(998);
		expect(data.consumeFloatInRange(-999.9999, -777.77)).toBe(
			-903.4772913756137,
		);
		expect(data.remainingBytes).toBe(994);
		expect(data.consumeDoubleInRange(-13.37, 31.337)).toBe(24.561393182922771);
		expect(data.remainingBytes).toBe(986);
		expect(data.consumeFloatInRange(1.0, 1.0)).toBe(1.0);
		expect(data.remainingBytes).toBe(986);
		expect(data.consumeDoubleInRange(1.0, 1.0)).toBe(1.0);
		expect(data.remainingBytes).toBe(986);
		// exhaust the buffer
		const str = data.consumeString(31337);
		expect(data.remainingBytes).toBe(0);
		expect(str.length).toBe(Data.length - 38);
		expect(data.consumeProbabilityFloat()).toBe(0.0);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeProbabilityDouble()).toBe(0.0);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeFloat()).toBe(FuzzedDataProvider.min_float);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeFloatInRange(123.0, 777.0)).toBe(123.0);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeDoubleInRange(-13.37, 31.337)).toBe(-13.37);
		expect(data.remainingBytes).toBe(0);
	});

	it("consumeDouble", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeDouble()).toBe(-1.5080858863606644e308);
		expect(data.remainingBytes).toBe(1015);
		expect(data.consumeDouble()).toBe(-1.2008768702117984e308);
		expect(data.remainingBytes).toBe(1006);
		expect(data.consumeDouble()).toBe(3.4351910123752656e307);
		expect(data.remainingBytes).toBe(997);
	});

	it("consumeNumber", () => {
		// some tests are from https://en.wikipedia.org/wiki/Double-precision_floating-point_format
		let data = new FuzzedDataProvider(
			Buffer.from([0, 0, 0, 0, 0, 0, 0xf0, 0x3f]),
		);
		expect(data.consumeNumber()).toBe(1);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([1, 0, 0, 0, 0, 0, 0xf0, 0x3f]));
		expect(data.consumeNumber()).toBe(1.0000000000000002);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([2, 0, 0, 0, 0, 0, 0xf0, 0x3f]));
		expect(data.consumeNumber()).toBe(1.0000000000000004);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0x0, 0x40]));
		expect(data.consumeNumber()).toBe(2);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0x0, 0xc0]));
		expect(data.consumeNumber()).toBe(-2);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0x08, 0x40]));
		expect(data.consumeNumber()).toBe(3);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0x10, 0x40]));
		expect(data.consumeNumber()).toBe(4);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0x14, 0x40]));
		expect(data.consumeNumber()).toBe(5);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]));
		expect(data.consumeNumber()).toBe(0);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0xf0, 0x7f]));
		expect(data.consumeNumber()).toBe(Number.POSITIVE_INFINITY);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0, 0, 0, 0, 0, 0, 0xf0, 0xff]));
		expect(data.consumeNumber()).toBe(Number.NEGATIVE_INFINITY);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([1, 0, 0, 0, 0, 0, 0xf0, 0x7f]));
		expect(data.consumeNumber()).toBe(Number.NaN);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([1, 0, 0, 0, 0, 0, 0xf8, 0x7f]));
		expect(data.consumeNumber()).toBe(Number.NaN);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(
			Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]),
		);
		expect(data.consumeNumber()).toBe(Number.NaN);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]));
		expect(data.consumeNumber()).toBe(Number.MIN_VALUE);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(
			Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xef, 0x7f]),
		);
		expect(data.consumeNumber()).toBe(Number.MAX_VALUE);
		expect(data.remainingBytes).toBe(0);

		// testing buffer sizes smaller 8
		data = new FuzzedDataProvider(Buffer.from([0xc0]));
		expect(data.consumeNumber()).toBe(-2);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0x00]));
		expect(data.consumeNumber()).toBe(0);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([]));
		expect(data.consumeNumber()).toBe(0);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0x37, 0x40]));
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0x00, 0x37, 0x40]));
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0x00, 0x00, 0x37, 0x40]));
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Buffer.from([0x00, 0x00, 0x00, 0x37, 0x40]));
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(
			Buffer.from([0x00, 0x00, 0x00, 0x00, 0x37, 0x40]),
		);
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(
			Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x37, 0x40]),
		);
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(
			Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x37, 0x40]),
		);
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(
			Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x37, 0x40]),
		);
		expect(data.consumeNumber()).toBe(23);
		expect(data.remainingBytes).toBe(1);

		data = new FuzzedDataProvider(Data);
		expect(data.consumeNumber()).toBe(Data.readDoubleLE(1016));
		expect(data.remainingBytes).toBe(1016);
		data.consumeBytes(8); // Note: reading from the left does not change the pointer to the right
		expect(data.remainingBytes).toBe(1008);
		expect(data.consumeNumber()).toBe(Data.readDoubleLE(1008));
		expect(data.remainingBytes).toBe(1000);
		expect(data.consumeNumber()).toBe(Data.readDoubleLE(1000));
		expect(data.remainingBytes).toBe(992);
	});

	it("consumeNumberInRange", () => {
		const data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeNumberInRange(1, 0);
		}).toThrow();
	});

	it("consumeNumbers", () => {
		let data = new FuzzedDataProvider(
			Buffer.from([
				0x40, 0x37, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x37, 0x00, 0x00,
				0x00, 0x00, 0x00, 0x00, 0x40, 0x37,
			]),
		);
		expect(() => {
			data.consumeNumbers(1.5);
		}).toThrow("length value must be an integer");
		expect(data.consumeNumbers(3)).toStrictEqual([23, 23, 23]);
		expect(data.remainingBytes).toBe(0);
		data = new FuzzedDataProvider(Data);
		const numbers = data.consumeNumbers(31337);
		expect(numbers.length).toBe(128);
		expect(data.remainingBytes).toBe(0);
		expect(numbers[numbers.length - 1]).toBe(86572714983330980);
	});

	it("edge cases for when consuming integers", () => {
		const data = new FuzzedDataProvider(Data);
		expect(data.consumeIntegral(1)).toBe(0x4a);
		expect(data.remainingBytes).toBe(1023);
		expect(data.consumeIntegral(2)).toBe(0x293d);
		expect(data.remainingBytes).toBe(1021);
		expect(data.consumeIntegral(3)).toBe(0xcf1639);
		expect(data.remainingBytes).toBe(1018);
		expect(data.consumeIntegral(4)).toBe(0x73433dd6);
		expect(data.remainingBytes).toBe(1014);
		expect(data.consumeIntegral(5)).toBe(0x54fd4d113a);
		expect(data.remainingBytes).toBe(1009);
		expect(data.consumeIntegral(6)).toBe(0x1ff651f930eb);
		expect(data.remainingBytes).toBe(1003);
		expect(data.consumeBigIntegral(7)).toBe(BigInt("0x32cb61ab886f30"));
		expect(data.consumeBigIntegral(8)).toBe(BigInt("0xb12dd933a2fb6239"));
		expect(data.consumeBigIntegral(9)).toBe(BigInt("0x85834feafdc0fd4f03"));
		expect(data.remainingBytes).toBe(979);
		// TODO: add more edge cases
	});

	it("consumeBigIntegral", () => {
		let data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeBigIntegral(1.5);
		}).toThrow("length value must be an integer");
		expect(data.consumeBigIntegral(1)).toBe(BigInt(0x4a));
		expect(data.remainingBytes).toBe(1023);
		expect(data.consumeBigIntegral(2)).toBe(BigInt(0x293d));
		expect(data.remainingBytes).toBe(1021);
		expect(data.consumeBigIntegral(3)).toBe(BigInt(0xcf1639));
		data = new FuzzedDataProvider(Data);
		const hexData = data
			.consumeRemainingAsBytes()
			.map((s) => s.toString(16).padStart(2, "0"))
			.reverse()
			.join("");
		data = new FuzzedDataProvider(Data);
		expect(data.consumeBigIntegral(data.remainingBytes)).toBe(
			BigInt("0x" + hexData),
		);
		expect(data.consumeBigIntegral(1, true)).toBe(BigInt(-128));
	});

	it("consumeIntegral", () => {
		let data = new FuzzedDataProvider(Data);
		expect(() => {
			data.consumeIntegral(7);
		}).toThrow();
		expect(() => {
			data.consumeIntegral(1023021031337);
		}).toThrow();
		expect(() => {
			data.consumeIntegral(1.5);
		}).toThrow("length value must be an integer");
		expect(data.remainingBytes).toBe(1024);
		expect(data.consumeIntegral(6)).toBe(0x4a293dcf1639);
		expect(data.remainingBytes).toBe(1018);
		for (let i = 0; i < 1013; i++) {
			data.consumeIntegral(1);
		}
		expect(data.consumeIntegral(6)).toBe(0x37440d198a);
		expect(data.remainingBytes).toBe(0);

		data = new FuzzedDataProvider(Data);
		expect(data.consumeIntegral(6, true)).toBe(0x4a293dcf1639 - 2 ** 47);
		expect(data.consumeIntegral(5, true)).toBe(0x73433dd654 - 2 ** 39);
		expect(data.consumeIntegral(4, true)).toBe(0xfd4d113a - 2 ** 31);
		expect(data.consumeIntegral(3, true)).toBe(0x1ff651 - 2 ** 23);
		expect(data.consumeIntegral(2, true)).toBe(0xf930 - 2 ** 15);
		expect(data.consumeIntegral(1, true)).toBe(0xeb - 2 ** 7);
	});
	it("consumeString", () => {
		const testString =
			"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
		const byteArray = new TextEncoder().encode(testString);
		const data = new FuzzedDataProvider(Buffer.from(byteArray));
		expect(data.consumeString(0)).toBe("");
		expect(data.remainingBytes).toBe(testString.length);
		expect(() => {
			data.consumeString(1.5);
		}).toThrow("length value must be an integer");
		expect(data.remainingBytes).toBe(testString.length);
		expect(data.consumeString(10, "utf8")).toBe("Lorem ipsu");
		expect(data.remainingBytes).toBe(testString.length - 10);
		expect(data.consumeString(20, "ascii")).toBe("m dolor sit amet, co");
		expect(data.remainingBytes).toBe(testString.length - 30);
		expect(data.consumeString(40, "ascii")).toBe(
			"nsectetur adipiscing elit, sed do eiusmo",
		);
		expect(data.remainingBytes).toBe(testString.length - 70);
		expect(data.consumeRemainingAsString()).toBe(
			"d tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
		);
		expect(data.remainingBytes).toBe(0);
		expect(data.consumeString(1000)).toBe("");
	});
	it("consumeStringArray", () => {
		const testString = "Lorem ipsum dolor sit amet";
		const byteArray = new TextEncoder().encode(testString);
		const data = new FuzzedDataProvider(Buffer.from(byteArray));
		expect(() => {
			data.consumeStringArray(1.5, 1);
		}).toThrow("length value must be an integer");
		expect(() => {
			data.consumeStringArray(1, 1.5);
		}).toThrow("length value must be an integer");
		const strings = data.consumeStringArray(5, 5);
		expect(strings).toHaveLength(5);
		expect(strings).toContain("Lorem");
		expect(strings).toContain(" ipsu");
		expect(strings).toContain("m dol");
		expect(strings).toContain("or si");
		expect(strings).toContain("t ame");
		const moreStrings = data.consumeStringArray(5, 0);
		expect(moreStrings).toHaveLength(5);
		for (const str of moreStrings) {
			expect(str).toHaveLength(0);
		}
	});
	it("verifyPrintableString", () => {
		const data = new FuzzedDataProvider(Buffer.from(Data));
		const consumedStrAsArr = [...data.consumeString(1024, "ascii", true)];
		consumedStrAsArr.forEach((c) => {
			const charAsNum = c.charCodeAt(0);
			expect(charAsNum >= 32 && charAsNum <= 126).toBeTruthy();
		});
	});
	it("verifyNonPrintableString", () => {
		const data = new FuzzedDataProvider(Buffer.from(Data));
		const consumedStrAsArr = [...data.consumeString(1024)];
		expect(
			consumedStrAsArr.some((ele) => {
				const eleAsNum = ele.charCodeAt(0);
				return eleAsNum < 32 || eleAsNum > 126;
			}),
		).toBeTruthy();
	});
});

const Data = Buffer.from([
	0x8a, 0x19, 0x0d, 0x44, 0x37, 0x0d, 0x38, 0x5e, 0x9b, 0xaa, 0xf3, 0xda, 0xaa,
	0x88, 0xf2, 0x9b, 0x6c, 0xba, 0xbe, 0xb1, 0xf2, 0xcf, 0x13, 0xb8, 0xac, 0x1a,
	0x7f, 0x1c, 0xc9, 0x90, 0xd0, 0xd9, 0x5c, 0x42, 0xb3, 0xfd, 0xe3, 0x05, 0xa4,
	0x03, 0x37, 0x49, 0x50, 0x4b, 0xbc, 0x39, 0xa2, 0x09, 0x6c, 0x2f, 0xaf, 0xd1,
	0xb5, 0x47, 0xbf, 0x92, 0xbd, 0x79, 0xe5, 0xc5, 0x6e, 0x51, 0xa4, 0xed, 0xe9,
	0xbd, 0x40, 0x4a, 0xfc, 0x25, 0x7a, 0x27, 0xc8, 0x92, 0xf7, 0x30, 0xde, 0x40,
	0x66, 0x66, 0xe8, 0x5f, 0x65, 0x39, 0x7e, 0x9e, 0x80, 0x2b, 0x01, 0x71, 0x2a,
	0xff, 0xd3, 0x0a, 0xac, 0x6e, 0x49, 0x32, 0x79, 0x10, 0x6a, 0x6f, 0x97, 0x96,
	0x70, 0x7e, 0x50, 0x65, 0xc9, 0x1d, 0xbd, 0x4e, 0x17, 0x04, 0x1e, 0xba, 0x26,
	0xac, 0x1f, 0xe3, 0x37, 0x1c, 0x15, 0x43, 0x60, 0x41, 0x2a, 0x7c, 0xca, 0x70,
	0xce, 0xab, 0x20, 0x24, 0xf8, 0xd9, 0x1f, 0x14, 0x7c, 0x5c, 0xdd, 0x6f, 0xb3,
	0xd7, 0x8b, 0x63, 0x10, 0xb7, 0xda, 0x99, 0xaf, 0x99, 0x01, 0x21, 0xe6, 0xe1,
	0x86, 0x27, 0xbe, 0x8d, 0xdf, 0x1e, 0xea, 0x80, 0x0b, 0x8a, 0x60, 0xc3, 0x3a,
	0x85, 0x33, 0x53, 0x59, 0xe1, 0xb5, 0xf1, 0x62, 0xa6, 0x7b, 0x24, 0x94, 0xe3,
	0x8c, 0x10, 0x93, 0xf8, 0x6e, 0xc2, 0x00, 0x91, 0x90, 0x0b, 0x5d, 0x52, 0x4f,
	0x21, 0xe3, 0x40, 0x3a, 0x6e, 0xb6, 0x32, 0x15, 0xdb, 0x5d, 0x01, 0x86, 0x63,
	0x83, 0x24, 0xc5, 0xde, 0xab, 0x31, 0x84, 0xaa, 0xe5, 0x64, 0x02, 0x8d, 0x23,
	0x82, 0x86, 0x14, 0x16, 0x18, 0x9f, 0x3d, 0x31, 0xbe, 0x3b, 0xf0, 0x6c, 0x26,
	0x42, 0x9a, 0x67, 0xfe, 0x28, 0xec, 0x28, 0xdb, 0x01, 0xb4, 0x52, 0x41, 0x81,
	0x7c, 0x54, 0xd3, 0xc8, 0x00, 0x01, 0x66, 0xb0, 0x2c, 0x3f, 0xbc, 0xaf, 0xac,
	0x87, 0xcd, 0x83, 0xcf, 0x23, 0xfc, 0xc8, 0x97, 0x8c, 0x71, 0x32, 0x8b, 0xbf,
	0x70, 0xc0, 0x48, 0x31, 0x92, 0x18, 0xfe, 0xe5, 0x33, 0x48, 0x82, 0x98, 0x1e,
	0x30, 0xcc, 0xad, 0x5d, 0x97, 0xc4, 0xb4, 0x39, 0x7c, 0xcd, 0x39, 0x44, 0xf1,
	0xa9, 0xd0, 0xf4, 0x27, 0xb7, 0x78, 0x85, 0x9e, 0x72, 0xfc, 0xcc, 0xee, 0x98,
	0x25, 0x3b, 0x69, 0x6b, 0x0c, 0x11, 0xea, 0x22, 0xb6, 0xd0, 0xcd, 0xbf, 0x6d,
	0xbe, 0x12, 0xde, 0xfe, 0x78, 0x2e, 0x54, 0xcb, 0xba, 0xd7, 0x2e, 0x54, 0x25,
	0x14, 0x84, 0xfe, 0x1a, 0x10, 0xce, 0xcc, 0x20, 0xe6, 0xe2, 0x7f, 0xe0, 0x5f,
	0xdb, 0xa7, 0xf3, 0xe2, 0x4c, 0x52, 0x82, 0xfc, 0x0b, 0xa0, 0xbd, 0x34, 0x21,
	0xf7, 0xeb, 0x1c, 0x5b, 0x67, 0xd0, 0xaf, 0x22, 0x15, 0xa1, 0xff, 0xc2, 0x68,
	0x25, 0x5b, 0xb2, 0x13, 0x3f, 0xff, 0x98, 0x53, 0x25, 0xc5, 0x58, 0x39, 0xd0,
	0x43, 0x86, 0x6c, 0x5b, 0x57, 0x8e, 0x83, 0xba, 0xb9, 0x09, 0x09, 0x14, 0x0c,
	0x9e, 0x99, 0x83, 0x88, 0x53, 0x79, 0xfd, 0xf7, 0x49, 0xe9, 0x2c, 0xce, 0xe6,
	0x7b, 0xf5, 0xc2, 0x27, 0x5e, 0x56, 0xb5, 0xb4, 0x46, 0x90, 0x91, 0x7f, 0x99,
	0x88, 0xa7, 0x23, 0xc1, 0x80, 0xb8, 0x2d, 0xcd, 0xf7, 0x6f, 0x9a, 0xec, 0xbd,
	0x16, 0x9f, 0x7d, 0x87, 0x1e, 0x15, 0x51, 0xc4, 0x96, 0xe2, 0xbf, 0x61, 0x66,
	0xb5, 0xfd, 0x01, 0x67, 0xd6, 0xff, 0xd2, 0x14, 0x20, 0x98, 0x8e, 0xef, 0xf3,
	0x22, 0xdb, 0x7e, 0xce, 0x70, 0x2d, 0x4c, 0x06, 0x5a, 0xa0, 0x4f, 0xc8, 0xb0,
	0x4d, 0xa6, 0x52, 0xb2, 0xd6, 0x2f, 0xd8, 0x57, 0xe5, 0xef, 0xf9, 0xee, 0x52,
	0x0f, 0xec, 0xc4, 0x90, 0x33, 0xad, 0x25, 0xda, 0xcd, 0x12, 0x44, 0x5f, 0x32,
	0xf6, 0x6f, 0xef, 0x85, 0xb8, 0xdc, 0x3c, 0x01, 0x48, 0x28, 0x5d, 0x2d, 0x9c,
	0x9b, 0xc0, 0x49, 0x36, 0x1e, 0x6a, 0x0a, 0x0c, 0xb0, 0x6e, 0x81, 0x89, 0xcb,
	0x0a, 0x89, 0xcf, 0x73, 0xc6, 0x63, 0x3d, 0x8e, 0x13, 0x57, 0x91, 0x4e, 0xa3,
	0x93, 0x8c, 0x61, 0x67, 0xfd, 0x13, 0xe0, 0x14, 0x72, 0xb3, 0xe4, 0x23, 0x45,
	0x08, 0x4e, 0x4e, 0xf5, 0xa7, 0xa8, 0xee, 0x30, 0xfd, 0x81, 0x80, 0x1f, 0xf3,
	0x4f, 0xd7, 0xe7, 0xf2, 0x16, 0xc0, 0xd6, 0x15, 0x6a, 0x0f, 0x89, 0x15, 0xa9,
	0xcf, 0x35, 0x50, 0x6b, 0x49, 0x3e, 0x12, 0x4a, 0x72, 0xe4, 0x59, 0x9d, 0xd7,
	0xdb, 0xd2, 0xd1, 0x61, 0x7d, 0x52, 0x4a, 0x36, 0xf6, 0xba, 0x0e, 0xfa, 0x88,
	0x6f, 0x3c, 0x82, 0x16, 0xf0, 0xd5, 0xed, 0x4d, 0x78, 0xef, 0x38, 0x17, 0x90,
	0xea, 0x28, 0x32, 0xa9, 0x79, 0x40, 0xff, 0xaa, 0xe6, 0xf5, 0xc7, 0x96, 0x56,
	0x65, 0x61, 0x83, 0x3d, 0xbd, 0xd7, 0xed, 0xd6, 0xb6, 0xc0, 0xed, 0x34, 0xaa,
	0x60, 0xa9, 0xe8, 0x82, 0x78, 0xea, 0x69, 0xf6, 0x47, 0xaf, 0x39, 0xab, 0x11,
	0xdb, 0xe9, 0xfb, 0x68, 0x0c, 0xfe, 0xdf, 0x97, 0x9f, 0x3a, 0xf4, 0xf3, 0x32,
	0x27, 0x30, 0x57, 0x0e, 0xf7, 0xb2, 0xee, 0xfb, 0x1e, 0x98, 0xa8, 0xa3, 0x25,
	0x45, 0xe4, 0x6d, 0x2d, 0xae, 0xfe, 0xda, 0xb3, 0x32, 0x9b, 0x5d, 0xf5, 0x32,
	0x74, 0xea, 0xe5, 0x02, 0x30, 0x53, 0x95, 0x13, 0x7a, 0x23, 0x1f, 0x10, 0x30,
	0xea, 0x78, 0xe4, 0x36, 0x1d, 0x92, 0x96, 0xb9, 0x91, 0x2d, 0xfa, 0x43, 0xab,
	0xe6, 0xef, 0x14, 0x14, 0xc9, 0xbc, 0x46, 0xc6, 0x05, 0x7c, 0xc6, 0x11, 0x23,
	0xcf, 0x3d, 0xc8, 0xbe, 0xec, 0xa3, 0x58, 0x31, 0x55, 0x65, 0x14, 0xa7, 0x94,
	0x93, 0xdd, 0x2d, 0x76, 0xc9, 0x66, 0x06, 0xbd, 0xf5, 0xe7, 0x30, 0x65, 0x42,
	0x52, 0xa2, 0x50, 0x9b, 0xe6, 0x40, 0xa2, 0x4b, 0xec, 0xa6, 0xb7, 0x39, 0xaa,
	0xd7, 0x61, 0x2c, 0xbf, 0x37, 0x5a, 0xda, 0xb3, 0x5d, 0x2f, 0x5d, 0x11, 0x82,
	0x97, 0x32, 0x8a, 0xc1, 0xa1, 0x13, 0x20, 0x17, 0xbd, 0xa2, 0x91, 0x94, 0x2a,
	0x4e, 0xbe, 0x3e, 0x77, 0x63, 0x67, 0x5c, 0x0a, 0xe1, 0x22, 0x0a, 0x4f, 0x63,
	0xe2, 0x84, 0xe9, 0x9f, 0x14, 0x86, 0xe2, 0x4b, 0x20, 0x9f, 0x50, 0xb3, 0x56,
	0xed, 0xde, 0x39, 0xd8, 0x75, 0x64, 0x45, 0x54, 0xe5, 0x34, 0x57, 0x8c, 0x3b,
	0xf2, 0x0e, 0x94, 0x1b, 0x10, 0xa2, 0xa2, 0x38, 0x76, 0x21, 0x8e, 0x2a, 0x57,
	0x64, 0x58, 0x0a, 0x27, 0x6d, 0x4c, 0xd0, 0xb5, 0xc1, 0xfc, 0x75, 0xd0, 0x01,
	0x86, 0x66, 0xa8, 0xf1, 0x98, 0x58, 0xfb, 0xfc, 0x64, 0xd2, 0x31, 0x77, 0xad,
	0x0e, 0x46, 0x87, 0xcc, 0x9b, 0x86, 0x90, 0xff, 0xb6, 0x64, 0x35, 0xa5, 0x5d,
	0x9e, 0x44, 0x51, 0x87, 0x9e, 0x1e, 0xee, 0xf3, 0x3b, 0x5c, 0xdd, 0x94, 0x03,
	0xaa, 0x18, 0x2c, 0xb7, 0xc4, 0x37, 0xd5, 0x53, 0x28, 0x60, 0xef, 0x77, 0xef,
	0x3b, 0x9e, 0xd2, 0xce, 0xe9, 0x53, 0x2d, 0xf5, 0x19, 0x7e, 0xbb, 0xb5, 0x46,
	0xe2, 0xf7, 0xd6, 0x4d, 0x6d, 0x5b, 0x81, 0x56, 0x6b, 0x12, 0x55, 0x63, 0xc3,
	0xab, 0x08, 0xbb, 0x2e, 0xd5, 0x11, 0xbc, 0x18, 0xcb, 0x8b, 0x12, 0x2e, 0x3e,
	0x75, 0x32, 0x98, 0x8a, 0xde, 0x3c, 0xea, 0x33, 0x46, 0xe7, 0x7a, 0xa5, 0x12,
	0x09, 0x26, 0x7e, 0x7e, 0x03, 0x4f, 0xfd, 0xc0, 0xfd, 0xea, 0x4f, 0x83, 0x85,
	0x39, 0x62, 0xfb, 0xa2, 0x33, 0xd9, 0x2d, 0xb1, 0x30, 0x6f, 0x88, 0xab, 0x61,
	0xcb, 0x32, 0xeb, 0x30, 0xf9, 0x51, 0xf6, 0x1f, 0x3a, 0x11, 0x4d, 0xfd, 0x54,
	0xd6, 0x3d, 0x43, 0x73, 0x39, 0x16, 0xcf, 0x3d, 0x29, 0x4a,
]);
