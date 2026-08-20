/**
 * Claude Code's write-confirmation guardians: commit, PR and
 * issue review.
 *
 * All three share the same shape pi's own guardians already have:
 * deterministic content gates (prose, section, title, redirect) run
 * first and block outright on a violation, exactly as pi's own
 * `review()` does before it ever shows a human anything. Only once
 * a command clears every gate does a human get asked - and unlike
 * pi's own `!ctx.hasUI -> ALLOW` fallback for a context with no
 * panel to show, an ordinary Claude Code chat is not headless: a
 * human is there, so this asks rather than silently allowing,
 * which is genuinely more protection than pi itself offers a
 * subagent or a headless run.
 *
 * The section and title gates cite pi's own skill names
 * (`github-pr-format`, `github-issue-format`) in their block
 * messages ("see the X skill for what belongs in each section").
 * agentic-harness.claude has no equivalent skill yet, so that
 * pointer is presently dead for a Claude Code user; the concrete
 * violation detail alongside it (which headings are invented,
 * missing or misordered) still is not, and stays actionable on its
 * own. Revisit once those guide skills port here.
 */

import type { Exec } from "../exec/index.js";
import type { GateDeps } from "../gate/index.js";
import type { GuardianResult } from "../guardian/types.js";
import {
	type IssueCommand,
	isIssueCommand,
	isPrCommand,
	type PrCommand,
	parseIssueCommand,
	parsePrCommand,
} from "../internal/github/cli.js";
import { readCommitFile } from "../internal/guardian/commit-file.js";
import { complaintsAbout } from "../internal/guardian/commit-format.js";
import {
	extractMessage,
	isGitCommitCommand,
} from "../internal/guardian/commit-shell.js";
import {
	proseGateNote,
	runProseGate,
} from "../internal/guardian/prose-gate.js";
import { runRedirectGate } from "../internal/guardian/redirect-gate.js";
import {
	runSectionGate,
	sectionGateNote,
} from "../internal/guardian/section-gate.js";
import {
	runTitleGate,
	titleGateNote,
} from "../internal/guardian/title-gate.js";
import { ISSUE_SECTIONS, PR_SECTIONS } from "../sections/index.js";

/** What a guardian check hands back to the hook dispatcher. */
export interface GuardianHookResult {
	decision: "deny" | "ask";
	reason: string;
}

/** Turn a GuardianResult into a deny reason, or null when it doesn't block. */
function denyFrom(result: GuardianResult): string | null {
	if (!result) return null;
	if ("block" in result) return result.reason;
	// No content gate ported so far emits rewrite, but the type allows
	// it: approximate as deny, naming the corrected form for the agent
	// to retry with, since a hook cannot splice a rewrite into the
	// call the way pi's guardian can.
	return `This command needs a change before it can run:\n\n${result.rewrite}`;
}

const MAX_PREVIEW = 4000;

/** Cap a body preview so the reason stays a reasonable size. */
function truncate(text: string): string {
	if (text.length <= MAX_PREVIEW) return text;
	return `${text.slice(0, MAX_PREVIEW)}\n... (truncated)`;
}

const PR_SECTION_CONFIG = {
	sanctioned: PR_SECTIONS,
	entityLabel: "PR",
	skill: "github-pr-format",
};
const PR_TITLE_CONFIG = { entityLabel: "PR", skill: "github-pr-format" };
const ISSUE_SECTION_CONFIG = {
	sanctioned: ISSUE_SECTIONS,
	entityLabel: "issue",
	skill: "github-issue-format",
};
const ISSUE_TITLE_CONFIG = {
	entityLabel: "issue",
	skill: "github-issue-format",
};

/** Plain-text review prompt for a commit message. */
function commitAskReason(
	message: string,
	isAmend: boolean,
	relentNote: string | null,
): string {
	const complaints = complaintsAbout(message);
	const notes =
		complaints.length > 0
			? `Format notes: ${complaints.join("; ")}.`
			: "Format looks clean (conventional, within the length limits).";
	const amendNote = isAmend ? " This amends the previous commit." : "";
	const relentSuffix = relentNote ? `\n\n${relentNote}` : "";
	return `Review this commit before it runs.${amendNote}\n\n${truncate(message)}\n\n${notes}${relentSuffix}`;
}

/**
 * Check a `git commit` command: the prose gate first (blocks
 * outright on a violation, same as pi), then an ask showing the
 * message and its format notes. Returns null for anything else, or
 * a message-less commit (nothing here to gate).
 */
export function checkCommitGuardian(
	command: string,
	deps: GateDeps,
): GuardianHookResult | null {
	if (!isGitCommitCommand(command)) return null;
	const message = extractMessage(command, readCommitFile);
	if (!message) return null;

	const proseDeny = denyFrom(runProseGate(deps, message));
	if (proseDeny) return { decision: "deny", reason: proseDeny };

	const isAmend = /--amend\b/.test(command);
	const relentNote = proseGateNote(deps, message);
	return {
		decision: "ask",
		reason: commitAskReason(message, isAmend, relentNote),
	};
}

/** Plain-text review prompt for a PR or issue body. */
function entityAskReason(
	label: string,
	action: "create" | "edit",
	title: string | null,
	body: string | null,
	relentNotes: (string | null)[],
): string {
	const parts = [`Review this ${label} ${action} before it runs.`];
	if (title) parts.push("", `Title: ${title}`);
	if (body) parts.push("", truncate(body));
	for (const note of relentNotes) {
		if (note) parts.push("", note);
	}
	return parts.join("\n");
}

/**
 * Check a `gh pr create`/`edit` command: the redirect gate (does
 * this checkout even belong to GitHub), then section, title and
 * prose - each blocking outright on a violation - then an ask
 * showing the title and body. Returns null for anything else.
 */
export async function checkPrGuardian(
	command: string,
	cwd: string,
	deps: GateDeps,
	exec: Exec,
): Promise<GuardianHookResult | null> {
	if (!isPrCommand(command)) return null;
	const parsed: PrCommand | null = parsePrCommand(command);
	if (!parsed) return null;

	const redirectDeny = denyFrom(
		await runRedirectGate(deps, { action: parsed.action, cwd, exec }),
	);
	if (redirectDeny) return { decision: "deny", reason: redirectDeny };

	const sectionDeny = denyFrom(
		runSectionGate(deps, parsed.body, PR_SECTION_CONFIG),
	);
	if (sectionDeny) return { decision: "deny", reason: sectionDeny };

	const titleDeny = denyFrom(runTitleGate(deps, parsed.title, PR_TITLE_CONFIG));
	if (titleDeny) return { decision: "deny", reason: titleDeny };

	const proseDeny = denyFrom(runProseGate(deps, parsed.body));
	if (proseDeny) return { decision: "deny", reason: proseDeny };

	return {
		decision: "ask",
		reason: entityAskReason("PR", parsed.action, parsed.title, parsed.body, [
			sectionGateNote(deps, parsed.body, PR_SECTION_CONFIG),
			titleGateNote(deps, parsed.title, PR_TITLE_CONFIG),
			proseGateNote(deps, parsed.body),
		]),
	};
}

/**
 * Check a `gh issue create`/`edit` command: section, title and
 * prose gates, then an ask showing the title and body. Returns
 * null for anything else.
 */
export function checkIssueGuardian(
	command: string,
	deps: GateDeps,
): GuardianHookResult | null {
	if (!isIssueCommand(command)) return null;
	const parsed: IssueCommand | null = parseIssueCommand(command);
	if (!parsed) return null;

	const sectionDeny = denyFrom(
		runSectionGate(deps, parsed.body, ISSUE_SECTION_CONFIG),
	);
	if (sectionDeny) return { decision: "deny", reason: sectionDeny };

	const titleDeny = denyFrom(
		runTitleGate(deps, parsed.title, ISSUE_TITLE_CONFIG),
	);
	if (titleDeny) return { decision: "deny", reason: titleDeny };

	const proseDeny = denyFrom(runProseGate(deps, parsed.body));
	if (proseDeny) return { decision: "deny", reason: proseDeny };

	return {
		decision: "ask",
		reason: entityAskReason("issue", parsed.action, parsed.title, parsed.body, [
			sectionGateNote(deps, parsed.body, ISSUE_SECTION_CONFIG),
			titleGateNote(deps, parsed.title, ISSUE_TITLE_CONFIG),
			proseGateNote(deps, parsed.body),
		]),
	};
}
