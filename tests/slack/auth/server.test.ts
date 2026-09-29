/**
 * The local server Slack's web redirect lands on.
 */

import { describe } from "vitest";
import { waitForOAuthCallback } from "../../../slack/auth/server.js";
import { callbackServerCases } from "../../support/oauth-callback.js";

describe("Slack's OAuth callback server", () => {
	callbackServerCases(waitForOAuthCallback);
});
