/**
 * The `notes` domain's CLI handler: one process per call, no
 * persisted state -- every verb is fully determined by
 * `notesRoot` plus its own params, so unlike `bin/quest.ts`
 * there is no `.agentic-harness/notes-state.json` to load or
 * save.
 *
 * Where quest's questsRoot defaults to one shared,
 * cross-repo location (a single campaign log every tool on
 * the machine sees), notesRoot defaults to the current
 * working directory: a notes archive is a property of the
 * repo you're standing in, not a machine-wide singleton.
 * Override with `--notes-root` or `AGENTIC_HARNESS_NOTES_ROOT`
 * when the archive isn't cwd itself.
 */

import { create } from "../notes/verbs/create.js";
import { reparent, retitle, retype, tag } from "../notes/verbs/mutate.js";
import { find, show, tree, types } from "../notes/verbs/queries.js";
import { reindex } from "../notes/verbs/reindex.js";
import type { NoteResult, NoteToolParams } from "../notes/verbs/shared.js";

function resolveNotesRoot(flagValue: string | undefined): string {
	return flagValue ?? process.env.AGENTIC_HARNESS_NOTES_ROOT ?? process.cwd();
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
