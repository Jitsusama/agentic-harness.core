/**
 * The local server Google's web redirect lands on.
 */

import { describe } from "vitest";
import { waitForOAuthCallback } from "../../../google/auth/server.js";
import { callbackServerCases } from "../../support/oauth-callback.js";

describe("Google's OAuth callback server", () => {
	callbackServerCases(waitForOAuthCallback);
});
