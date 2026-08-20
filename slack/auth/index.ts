/**
 * Slack authentication: credential state and error formatting.
 *
 * `ensureAuthenticated` itself, the interactive orchestration that
 * runs the setup wizard and/or OAuth web redirect flow, needs a
 * host's UI and stays adapter-local; everything it is built from
 * (credential storage, the OAuth exchange, the callback server, the
 * browser opener, error formatting) lives here.
 */

export type { OAuthApp, StoredToken } from "../types.js";
export {
	clearAllConfig,
	getOAuthApp,
	getToken,
	hasOAuthApp,
	hasToken,
	storeOAuthApp,
	storeToken,
} from "./credentials.js";
export { formatAuthError } from "./errors.js";
