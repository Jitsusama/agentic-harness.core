/**
 * Cutting trees with plain git.
 *
 * The general case, so that the broker works before anything
 * downstream registers. A repo with a checkout on disk gets a git
 * worktree beside the state directory, detached at a commit for a
 * snapshot or on its branch for a worktree.
 *
 * It deliberately does not clone. A repo known only by a remote is
 * refused with the remote named, because a clone of an unasked-for
 * repo can be enormous and quietly spending ten minutes on one is a
 * surprising thing for a tool to do on its own. Saying what is
 * needed leaves the choice with whoever knows how big it is; a
 * downstream provider that knows a particular repo can serve it
 * without asking.
 */

import { join } from "node:path";
import { type Exec, run } from "../../exec/index.js";
import { withoutCredentials } from "../../remote/index.js";
import { displayPath } from "../../ui/path.js";
import type { TreeProvider } from "../broker.js";
import { type TreeRequest, treeIdentity, treeSource } from "../tree.js";

/**
 * Whether a tree standing at `head` is the commit asked for. A short id
 * names the full one it begins, which is how people write commits; a
 * snapshot pinned by one was refused against itself.
 */
function sameCommit(head: string, asked: string): boolean {
	if (head === asked) return true;
	return /^[0-9a-f]{7,}$/i.test(asked) && head.startsWith(asked.toLowerCase());
}

/**
 * How to check a worktree out on `branch`, whether or not it exists.
 *
 * A branch that is here is checked out as it is. One only origin has is
 * made to follow origin's. One nobody has yet is made from the base asked
 * for, or origin's default, tracking nothing: `worktree add` without `-b`
 * refused every new name with `invalid reference`, and a branch that
 * tracked origin's default had its leased push compared against main.
 */
async function branchArgs(
	git: (...args: string[]) => ReturnType<Exec>,
	path: string,
	branch: string,
	base: string | undefined,
): Promise<string[]> {
	const exists = async (ref: string) =>
		(await git("rev-parse", "--verify", "--quiet", ref)).code === 0;
	if (await exists(`refs/heads/${branch}`)) return [path, branch];
	if (await exists(`refs/remotes/origin/${branch}`)) {
		return ["--track", "-b", branch, path, `origin/${branch}`];
	}
	if (base !== undefined) return ["--no-track", "-b", branch, path, base];
	const head = await git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD");
	const start =
		head.code === 0 && head.stdout.trim() !== ""
			? head.stdout.trim().replace(/^refs\/remotes\//, "")
			: "HEAD";
	return ["--no-track", "-b", branch, path, start];
}

/**
 * What to say when git will not cut a tree: git's own words, and when
 * another checkout holds the branch, the remedy that works. Git keeps
 * one checkout per branch, so a tree on `main` beside the main checkout
 * can only be a new branch from it, or a snapshot to read.
 */
function cutFailure(said: string, request: TreeRequest): string {
	const words = said.trim();
	const held = words.match(
		/already (?:used by worktree|checked out) at '([^']+)'/,
	);
	if (request.intent === "worktree" && held) {
		return `${words}\n${request.branch} is checked out at ${displayPath(held[1] ?? "")}, and git keeps one checkout per branch. Cut this tree on a new branch, which is made from ${request.branch} when you name it as the base, or take a snapshot to read it.`;
	}
	return `Cutting a tree for ${request.purpose} failed: ${words}`;
}

/** The built-in provider's id, and the general case's specificity. */
const ID = "git-worktree";
const GENERAL = 0;

/**
 * A tree provider backed by `git worktree`.
 *
 * Applies to every repo, since git is what the general case means.
 * Anything more specific outranks it by declaring a higher
 * specificity.
 */
export function createGitTreeProvider(deps: {
	/** Runs git for a call nobody can stop. */
	exec: Exec;
	/**
	 * Runs git for a call that can be stopped, stopping git with it.
	 * Without it every call uses `exec`, and a stop reaches only the
	 * promise waiting on git rather than git itself.
	 */
	execFor?: (signal: AbortSignal) => Exec;
	stateDir: string;
}): TreeProvider {
	const execOf = (signal: AbortSignal | undefined): Exec =>
		signal !== undefined && deps.execFor !== undefined
			? deps.execFor(signal)
			: deps.exec;
	return {
		id: ID,
		specificity: GENERAL,
		appliesTo: () => true,

		async ensure(request, options) {
			const exec = execOf(options?.signal);
			const source = treeSource(request.repo);
			if (source.kind === "unknown") {
				throw new Error(
					`Nothing is known about where ${request.repo.key} lives, locally or by remote, so there is nowhere to cut a tree from.`,
				);
			}
			if (source.kind === "clone") {
				throw new Error(
					`${request.repo.key} is known only as ${withoutCredentials(source.remoteUrl)}, and cloning a repo you did not ask for can take a very long time. Clone it yourself, or register a provider that knows this repo.`,
				);
			}

			const path = join(deps.stateDir, treeIdentity(request).key);

			// Already there is the ordinary case, not a failure. `ensure` means
			// make sure it exists, a snapshot is shareable between readers by
			// design, and the broker holding one only remembers for as long as
			// the session does while the directory outlives it. So the second
			// session to review a commit found the tree its predecessor cut and
			// died on `fatal: already exists`, then fell back to letting
			// reviewers read the working checkout.
			const standing = await exec("git", ["-C", path, "rev-parse", "HEAD"]);
			if (standing.code === 0) {
				const head = standing.stdout.trim();
				// A snapshot's commit is part of its identity, so a tree under
				// this name standing anywhere else is not the thing being asked
				// for. Refuse rather than hand it over: silently reviewing a
				// different commit is the one outcome nobody could detect.
				if (
					request.intent === "snapshot" &&
					!sameCommit(head, request.commit)
				) {
					throw new Error(
						`A tree for ${request.repo.key} already sits at ${displayPath(path)} but stands at ${head} rather than ${request.commit}. Release it before pinning a snapshot there.`,
					);
				}
				return { path };
			}

			const git = (...args: string[]) =>
				exec("git", ["-C", source.path, ...args]);
			let at: string[];
			if (request.intent === "snapshot") {
				// A commit somebody else pushed is often not here yet, which
				// left a review reading the checkout at whatever commit it
				// stood on. Asking origin for it costs one fetch, and when
				// origin will not give it, git's refusal below says so.
				const have = await git("cat-file", "-e", `${request.commit}^{commit}`);
				if (have.code !== 0) {
					await git("fetch", "--quiet", "--no-tags", "origin", request.commit);
				}
				at = ["--detach", path, request.commit];
			} else {
				at = await branchArgs(git, path, request.branch, request.baseBranch);
			}
			const cut = await exec("git", [
				"-C",
				source.path,
				"worktree",
				"add",
				...at,
			]);
			if (cut.code !== 0) {
				throw new Error(cutFailure(cut.stderr || cut.stdout, request));
			}
			return { path };
		},

		async release(held, options) {
			// Scoped to the tree itself, which is the one repo guaranteed
			// to know about it. Without a -C this ran against whatever
			// repo the process happened to be sitting in, and git then
			// reports that the path is not a working tree, which is true
			// of that repo and beside the point. A worktree's .git file
			// names its main repo, so asking from inside is enough and
			// needs no source path carried on the held tree.
			await run(
				execOf(options?.signal),
				"git",
				["-C", held.path, "worktree", "remove", held.path],
				`Releasing the tree at ${displayPath(held.path)}`,
			);
		},
	};
}
