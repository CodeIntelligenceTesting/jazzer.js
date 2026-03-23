/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import { default as bind } from "bindings";

type NativeAddon = {
	sigsegv: (loc: number) => void;
};

const addon: NativeAddon = bind("signal_impl");

export function sigsegv(loc: number) {
	addon.sigsegv(loc);
}
