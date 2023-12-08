/*
 * Copyright 2023 Code Intelligence GmbH
 *
 * Unless required by applicable law or agreed to in writing, this software
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied.
 */

import { PluginTarget } from "@babel/core";

/**
 * Instrumentation plugins are can be used to add additional instrumentation by
 * bug detectors.
 */
export class InstrumentationPlugins {
	private _plugins: Array<() => PluginTarget> = [];

	registerPlugin(plugin: () => PluginTarget) {
		this._plugins.push(plugin);
	}

	get plugins() {
		return this._plugins;
	}
}

export const instrumentationPlugins = new InstrumentationPlugins();

export function registerInstrumentationPlugin(plugin: () => PluginTarget) {
	instrumentationPlugins.registerPlugin(plugin);
}
