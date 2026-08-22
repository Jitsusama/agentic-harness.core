/**
 * The `notes` domain's CLI handler: one process per call, no
 * persisted state -- every verb is fully determined by
 * `notesRoot` plus its own params, so unlike `bin/quest.ts`
 * there is no `.agentic-harness/notes-state.json` to load or
 * save.
 *
 * notesRoot resolves the same way quest's questsRoot does: a
 * single default location every tool on the machine sees
 * unless told otherwise, not something that shifts under you
 * as cwd changes. There's no sibling pi extension to alias
 * onto (quest's default points at the exact path
 * agentic-harness.pi's quest-workflow extension already
 * writes to), so notes gets its own XDG-rooted default
 * instead. Override with `--notes-root` or
 * `AGENTIC_HARNESS_NOTES_ROOT` when the archive lives
 * somewhere else -- e.g. a specific repo's notes tree.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { create } from "../notes/verbs/create.js";
import { reparent, retitle, retype, tag } from "../notes/verbs/mutate.js";
import { find, show, tree, types } from "../notes/verbs/queries.js";
import { reindex } from "../notes/verbs/reindex.js";
import type { NoteResult, NoteToolParams } from "../notes/verbs/shared.js";

/**
 * Default notesRoot: an XDG data-dir location, mirroring how
 * `bin/quest.ts`'s `defaultQuestsRoot` resolves.
 */
export function defaultNotesRoot(
	env: NodeJS.ProcessEnv = process.env,
	home = homedir(),
): string {
	const override = env.XDG_DATA_HOME;
	const root =
		override && override.length > 0 ? override : join(home, ".local", "share");
	return join(root, "agentic-harness", "notes");
}

function resolveNotesRoot(flagValue: string | undefined): string {
	return (
		flagValue ?? process.env.AGENTIC_HARNESS_NOTES_ROOT ?? defaultNotesRoot()
	);
}

export interface NotesCliOptions {
	action: string;
	notesRoot: string | undefined;
}

/** Run one notes action against `notesRoot`, resolved from the flag/env/cwd chain. */
export async function runNotesAction(
	options: NotesCliOptions,
	params: NoteToolParams,
): Promise<NoteResult> {
	const notesRoot = resolveNotesRoot(options.notesRoot);
	switch (options.action) {
		case "create":
			return create(notesRoot, params);
		case "find":
			return find(notesRoot, params);
		case "show":
			return show(notesRoot, params);
		case "retype":
			return retype(notesRoot, params);
		case "retitle":
			return retitle(notesRoot, params);
		case "tag":
			return tag(notesRoot, params);
		case "reparent":
			return reparent(notesRoot, params);
		case "tree":
			return tree(notesRoot, params);
		case "types":
			return types(notesRoot);
		case "reindex":
			return reindex(notesRoot);
		default:
			return {
				ok: false,
				guidance: `Unknown action "${options.action}". See the notes skill for the full list.`,
			};
	}
}
