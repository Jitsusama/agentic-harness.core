/**
 * The prepare-commit-msg hook that attributes every commit made
 * under an adapter, not just a typed `git commit`. Command-level
 * injection only sees a literal git commit; cherry-pick, revert,
 * rebase, merge and editor commits reach attribution only through
 * this hook.
 *
 * The trigger condition (an env var pi can set before its own tool
 * call, a marker file a Claude Code hook can only write to disk,
 * ...) is the one thing that genuinely differs per adapter, so it's
 * the one thing this module takes as a parameter rather than
 * assuming. Everything else — idempotent install, chaining any
 * hook the repo already had, never adding a second AI co-author —
 * is host-agnostic and shared.
 */

import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

/**
 * How an adapter's hook decides whether to attribute a commit, and
 * how it identifies its own installed hook.
 */
export interface CommitHookOptions {
	/** Comment marker identifying this as this adapter's hook, for idempotent (re)installs. */
	readonly marker: string;
	/** Filename suffix for a pre-existing hook this displaces (e.g. "pi-chained"). */
	readonly chainedSuffix: string;
	/** Shell test that must succeed for this commit to be attributed, e.g. `[ -n "$PI_CO_AUTHOR" ]`. */
	readonly gateTest: string;
	/** Shell expression yielding the trailer line text, e.g. `"$PI_CO_AUTHOR"`. */
	readonly trailerExpr: string;
}

/** Build the prepare-commit-msg script for the given adapter options. */
export function buildPrepareCommitMsgHook(options: CommitHookOptions): string {
	return `#!/bin/sh
# ${options.marker}
# Appends the AI co-author trailer to commits made under this adapter.
# Idempotent and chains to any displaced hook.

msg_file="$1"

chained="$(CDPATH= cd "$(dirname "$0")" && pwd)/prepare-commit-msg.${options.chainedSuffix}"
if [ -x "$chained" ]; then
	"$chained" "$@" || exit $?
fi

${options.gateTest} || exit 0
[ -f "$msg_file" ] || exit 0

if grep -qi 'co-authored-by[: ]*ai' "$msg_file"; then
	exit 0
fi

git interpret-trailers --in-place --trailer ${options.trailerExpr} "$msg_file"
`;
}

/** The outcome of trying to install the hook. */
export interface HookInstall {
	readonly installed: boolean;
	readonly reason?: string;
}

/**
 * Install the prepare-commit-msg hook into a repo's hooks
 * directory, honouring core.hooksPath and chaining any existing
 * hook. A no-op when this adapter's hook is already installed.
 */
export function installCommitHook(
	repoRoot: string,
	options: CommitHookOptions,
): HookInstall {
	// A custom core.hooksPath means a hook manager (husky and the
	// like) or a shared, possibly version-controlled hooks directory
	// owns the hooks. Leave it alone rather than write this adapter's
	// hook into a directory it does not own.
	if (hasCustomHooksPath(repoRoot)) {
		return { installed: false, reason: "custom core.hooksPath configured" };
	}

	let hooksDir: string;
	try {
		hooksDir = resolveHooksDir(repoRoot);
	} catch (error) {
		return { installed: false, reason: `not a git repo: ${String(error)}` };
	}

	const target = join(hooksDir, "prepare-commit-msg");
	if (
		existsSync(target) &&
		readFileSync(target, "utf8").includes(options.marker)
	) {
		return { installed: false, reason: "already installed" };
	}

	if (existsSync(target)) {
		const chained = join(
			hooksDir,
			`prepare-commit-msg.${options.chainedSuffix}`,
		);
		// A backup already here means a non-adapter hook was chained
		// before; renaming over it would lose the original, so refuse
		// instead.
		if (existsSync(chained)) {
			return {
				installed: false,
				reason: `a prepare-commit-msg.${options.chainedSuffix} backup already exists`,
			};
		}
		renameSync(target, chained);
	}

	writeFileSync(target, buildPrepareCommitMsgHook(options), { mode: 0o755 });
	chmodSync(target, 0o755);
	return { installed: true };
}

/** Whether the repo configures a custom core.hooksPath. */
function hasCustomHooksPath(repoRoot: string): boolean {
	try {
		const value = execFileSync(
			"git",
			["-C", repoRoot, "config", "--get", "core.hooksPath"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		).trim();
		return value.length > 0;
	} catch {
		// git config exits non-zero when the key is unset: no custom path.
		return false;
	}
}

/**
 * Ensure the hook is installed in the repo containing dir, at most
 * once per repo root. Resolves the repo, records it in `installed`
 * so later commands in the same repo are skipped, and installs
 * best-effort. A directory outside any git repo is a no-op. This is
 * how hook coverage follows the session into repos it later cds
 * into, rather than only the repo the session started in.
 */
export function ensureCommitHook(
	dir: string,
	installed: Set<string>,
	options: CommitHookOptions,
): void {
	const root = repoRootOf(dir);
	if (!root || installed.has(root)) return;
	installed.add(root);
	try {
		installCommitHook(root, options);
	} catch {
		// Best-effort: never let hook installation break a command.
	}
}

/** Resolve the active hooks directory, honouring core.hooksPath. */
function resolveHooksDir(repoRoot: string): string {
	const path = execFileSync(
		"git",
		["-C", repoRoot, "rev-parse", "--git-path", "hooks"],
		{ encoding: "utf8" },
	).trim();
	return isAbsolute(path) ? path : join(repoRoot, path);
}

/** The git repository root containing dir, or null when there is none. */
export function repoRootOf(dir: string): string | null {
	try {
		return execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		// Not a git repository (or git unavailable): no hook to install.
		return null;
	}
}
