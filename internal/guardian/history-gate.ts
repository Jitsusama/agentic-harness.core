/**
 * Destructive git command detection: the decision core behind
 * history-guardian's confirmation gate.
 *
 * Unlike the content gates (prose, section, title), this has no
 * block-once-relent-on-repeat state machine: a `git reset --hard`
 * is exactly as destructive the fifth time it is attempted as the
 * first, so there is nothing here for a GateDeps signature store to
 * do. Detection runs fresh on every command.
 *
 * Getting a human's actual allow/block/redirect decision needs a
 * host's own confirmation UI (pi's modal, Claude Code's native
 * permission prompt) and stays adapter-local, along with how each
 * host renders the match into what its UI shows. This is only the
 * pure "is this command one of the ones we warn about" question.
 */

/** How dangerous a destructive git operation is. */
export type Severity = "irrecoverable" | "risky";

/** A regex pattern that matches a destructive git command. */
export interface DestructivePattern {
	pattern: RegExp;
	severity: Severity;
	description: string;
}

/**
 * Known destructive git patterns, ordered from most specific to
 * most general so narrower matches win (e.g. --force-with-lease,
 * risky, must precede the general --force pattern, irrecoverable).
 */
export const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
	// Risky: recoverable via reflog or other means
	{
		pattern: /\bgit\s+push\b[^|;]*--force-with-lease\b/,
		severity: "risky",
		description:
			"Force push with lease: safer than --force but still rewrites remote history.",
	},
	{
		pattern: /\bgit\s+stash\s+drop\b/,
		severity: "risky",
		description:
			"Drops a stash entry. Recoverable via git reflog for ~30 days.",
	},
	{
		pattern: /\bgit\s+rebase\b/,
		severity: "risky",
		description: "Rewrites commit history. Recoverable via git reflog.",
	},

	// Irrecoverable: data loss likely
	{
		pattern: /\bgit\s+reset\s+--hard\b/,
		severity: "irrecoverable",
		description: "Permanently discards all uncommitted changes.",
	},
	{
		pattern: /\bgit\s+clean\s+-[a-z]*f/,
		severity: "irrecoverable",
		description: "Permanently deletes untracked files.",
	},
	{
		pattern: /\bgit\s+push\b[^|;]*(?:--force\b|-f\b)/,
		severity: "irrecoverable",
		description:
			"Force push overwrites remote history: commits may be permanently lost.",
	},
	{
		pattern: /\bgit\s+branch\s+-D\b/,
		severity: "irrecoverable",
		description: "Force-deletes branch regardless of merge status.",
	},
	{
		pattern: /\bgit\s+checkout\s+--\s+\./,
		severity: "irrecoverable",
		description: "Discards all uncommitted changes to tracked files.",
	},
];

/** A command matched against the destructive patterns. */
export interface DestructiveMatch {
	command: string;
	severity: Severity;
	description: string;
}

/**
 * Match a command against the known destructive patterns, returning
 * the first (most specific) match, or null when nothing matches.
 */
export function detectDestructiveCommand(
	command: string,
): DestructiveMatch | null {
	for (const { pattern, severity, description } of DESTRUCTIVE_PATTERNS) {
		if (pattern.test(command)) return { command, severity, description };
	}
	return null;
}
