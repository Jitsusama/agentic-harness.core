/**
 * Claude Code's Slack setup: the CLI-adapter half of the OAuth
 * setup wizard port.
 *
 * pi's own setup wizard is interactive UI (promptSingle, a modal
 * offering three paths) - genuinely adapter-local, since it drives
 * a host's own confirmation surface the way a guardian's review()
 * does. What is NOT adapter-local is everything the wizard actually
 * runs once a path is chosen: extracting a browser session,
 * running an OAuth exchange, storing the result. All of that
 * already lives in the slack package (ported alongside the API
 * client), untouched here.
 *
 * The adapter decision this needed: unlike a guardian, a setup
 * wizard is not something a tool call needs to pause for - nothing
 * intercepts anything. It is a workflow the user asks for, which is
 * exactly the shape a Claude Code *skill* already covers (see
 * skills/tdd, skills/quest): a markdown file teaching Claude to run
 * a sequence of Bash-invoked CLI calls and carry the human-facing
 * conversation itself (ask for a client ID, tell the user to check
 * their browser, report success). No hook, no new capability -
 * just a CLI surface for the skill to call, the same shape every
 * other skill here already uses.
 *
 * Only the browser-extraction path is wired up so far: it needs no
 * OAuth app (Slack's own "recommended" path in pi's wizard too),
 * so it is the one genuinely zero-setup way in. The OAuth-app path
 * (buildAuthUrl/waitForOAuthCallback/exchangeCodeForToken, all
 * already portable in slack/auth/oauth.ts and server.ts) is the
 * natural next CLI verb when someone wants it; not built here
 * because nothing in this repo yet needs it, and it is a
 * mechanical follow-on once it does; see google-auth.ts for a
 * companion note on the device flow, which is the same shape again.
 */

import { extractFromBrowser } from "../slack/auth/browser-extract.js";
import { getToken, hasToken, SlackClient, storeToken } from "../slack/index.js";

/** Report whether a usable Slack session is currently stored. */
export async function runSlackAuthStatus(): Promise<unknown> {
	if (!hasToken()) return { authenticated: false };
	const token = getToken();
	if (!token) return { authenticated: false };

	const client = new SlackClient(token.accessToken, token.cookie);
	try {
		const auth = await client.call("auth.test");
		return {
			authenticated: true,
			team: auth.team ?? token.teamName,
			user: auth.user,
		};
	} catch {
		return {
			authenticated: false,
			reason: "the stored session no longer works; run login again",
		};
	}
}

/**
 * Extract a Slack session by opening a real browser window and
 * waiting for the user to be (or become) logged in, then verify
 * and store it. Blocks for up to five minutes; the skill calling
 * this should say so before it runs.
 */
export async function runSlackAuthLogin(): Promise<unknown> {
	let credentials: { token: string; cookie: string };
	try {
		credentials = await extractFromBrowser();
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}

	const client = new SlackClient(credentials.token, credentials.cookie);
	try {
		const auth = await client.call("auth.test");
		storeToken({
			accessToken: credentials.token,
			cookie: credentials.cookie,
			userId: typeof auth.user_id === "string" ? auth.user_id : "",
			teamId: typeof auth.team_id === "string" ? auth.team_id : "",
			teamName: typeof auth.team === "string" ? auth.team : undefined,
			// Not an OAuth grant, so there is no scope list; named so a
			// reader of the stored file can tell this token apart from
			// one that came through the OAuth app path.
			scopes: "browser-session",
		});
		return { ok: true, team: auth.team, user: auth.user };
	} catch (err) {
		return {
			ok: false,
			error: `extracted a session but it did not verify: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
