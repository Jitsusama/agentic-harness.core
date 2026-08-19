/**
 * Claude Code's attribution wiring: the CLI-adapter half of the
 * attribution domain's commit-hook port (see attribution/commit-hook.ts
 * for why the trigger condition is a parameter at all).
 *
 * Pi can set an env var in its own process right before the bash
 * tool call it precedes. A PreToolUse hook is a separate process
 * that exits before that tool call runs, with no way to inject an
 * env var forward into it. The signal this adapter uses instead is
 * a marker file written next to the installed hook script itself:
 * idempotent to refresh, trivial for the hook to read, and it
 * needs no cooperation from the tool call that follows.
 *
 * The real behavioural difference this trades away: pi's env var
 * is scoped to one tool call, so a human typing `git commit`
 * themselves in the same repo is never attributed. This marker
 * file persists for the repo once written, so it cannot tell an
 * agent-driven commit from a human one made in the same repo while
 * the plugin is active. Given the domain's own stated ethos (over-
 * attributing in an unwatched, headless run is a smaller sin than
 * under-attributing), that's an accepted trade, not an oversight.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
	type CommitHookOptions,
	ensureCommitHook,
	insertGhBodyFooter,
	repoRootOf,
} from "../attribution/index.js";

/** Filename of the marker file, written beside the installed hook. */
const MARKER_FILENAME = "agentic-harness-claude-co-author";

/** The trailer line the installed hook appends to a commit message. */
const COMMIT_TRAILER =
	"Co-Authored-By: AI via Claude Code <noreply@anthropic.com>";

/** The footer spliced into an unattributed gh pr/issue body. */
const GH_FOOTER =
	"\n\n---\n*Co-Authored-By AI via [Claude Code](https://claude.com/claude-code)*";

/** Matches existing attribution, so a re-run never double-attributes. */
const ALREADY_ATTRIBUTED = /co-authored-by[:\s]+ai/i;

const CLAUDE_OPTIONS: CommitHookOptions = {
	marker: "agentic-harness-claude-commit-attribution-hook",
	chainedSuffix: "agentic-harness-claude-chained",
	gateTest: `[ -f "$(dirname "$0")/${MARKER_FILENAME}" ]`,
	trailerExpr: `"$(cat "$(dirname "$0")/${MARKER_FILENAME}")"`,
};

/** Resolve the active hooks directory, honouring core.hooksPath. */
function resolveHooksDir(repoRoot: string): string {
	const path = execFileSync(
		"git",
		["-C", repoRoot, "rev-parse", "--git-path", "hooks"],
		{ encoding: "utf8" },
	).trim();
	return isAbsolute(path) ? path : join(repoRoot, path);
}

/**
 * Ensure the commit-attribution hook and its marker file exist for
 * dir's repo. Best-effort and silent: this runs on every bash call,
 * not just git ones, so coverage follows the agent as it cds
 * between repos, matching pi's own ensureCommitHook usage.
 */
export function ensureAttributionHook(dir: string): void {
	const root = repoRootOf(dir);
	if (!root) return;
	ensureCommitHook(dir, new Set(), CLAUDE_OPTIONS);
	try {
		writeFileSync(
			join(resolveHooksDir(root), MARKER_FILENAME),
			`${COMMIT_TRAILER}\n`,
		);
	} catch {
		// Best-effort: never let marker maintenance break a command.
	}
}

/**
 * Check a gh pr/issue command for missing attribution. A hook can't
 * rewrite the call the way pi's guardian can, so this hands back a
 * reason naming the corrected command for the agent to retry with,
 * rather than splicing it in place.
 */
export function checkAttribution(command: string): string | null {
	for (const entity of ["pr", "issue"] as const) {
		const result = insertGhBodyFooter(command, entity, GH_FOOTER, (body) =>
			ALREADY_ATTRIBUTED.test(body),
		);
		if (result.kind === "rewritten") {
			return (
				"This command needs AI co-authorship attribution before it can " +
				`run. Retry with:\n\n${result.command}`
			);
		}
		if (result.kind === "blocked") {
			return `Attribution cannot be applied to this gh ${entity} command: ${result.reason}.`;
		}
	}
	return null;
}
