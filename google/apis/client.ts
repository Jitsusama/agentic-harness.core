/**
 * The googleapis client, loaded on first use.
 *
 * googleapis bundles a client for every Google API, about 1,800
 * modules, and every extension that imports this package would load
 * all of them at startup. This stands in for its `google` export and
 * loads the real one the first time any API is asked for.
 */

import { createRequire } from "node:module";
import type { GoogleApis } from "googleapis";

const require = createRequire(import.meta.url);

let loaded: GoogleApis | undefined;

function load(): GoogleApis {
	loaded ??= (require("googleapis") as { google: GoogleApis }).google;
	return loaded;
}

export const google = new Proxy({} as GoogleApis, {
	get(_, property) {
		const real = load();
		const value = Reflect.get(real, property);
		// The API factories read shared options off `this`.
		return typeof value === "function" ? value.bind(real) : value;
	},
});
