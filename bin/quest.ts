/**
 * The `quest` domain's CLI handler: one process per call, state
 * read from and written back to a small JSON file the caller owns
 * -- the same shape `bin/cli.ts`'s tdd handlers use.
 *
 * Unlike tdd's loop state, a quest's on-disk questsRoot is shared,
 * deliberate infrastructure: by default it resolves to the exact
 * XDG path agentic-harness.pi's own quest-workflow extension
 * writes to (`~/.local/share/pi/agentic-harness.pi/quest-workflow/
 * quests`, honouring XDG_DATA_HOME). That's not incidental -- an
 * adapter with no override should see the same quest tree pi does,
 * on the same machine, out of the box, since a quest tree is meant
 * to be one shared campaign log across every tool that touches it.
 * Override with `--quests-root` or `AGENTIC_HARNESS_QUESTS_ROOT`
 * when that's not what's wanted.
 *
 * This CLI covers the subset of pi's quest-workflow verb surface
 * that has no pi-specific session concept baked in: no per-session
 * liveness in `show`/`list`, no automatic session-attach on `load`,
 * no `session-*`/`spawn-*`/`workspace`/`recent`/`restore` (all keyed
 * to pi's own session JSONL log and terminal-reopen mechanism, which
 * this CLI has no equivalent for). An adapter with its own session
 * story layers that on top of these verbs the way pi's own
 * `extensions/quest-workflow` does.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { registerBuiltinUrlFetchers } from "../quest/index.js";
import { createQuestState, type QuestState } from "../quest/state.js";
import type { QuestPriority } from "../quest/types.js";
import { aliasAdd, aliasRemove } from "../quest/verbs/alias.js";
import {
	create,
	focus,
	list,
	load,
	reclassify,
	show,
	unfocus,
	unload,
} from "../quest/verbs/lifecycle.js";
import {
	ancestors,
	expand,
	find,
	linksAction,
	locate,
	tree,
	who,
} from "../quest/verbs/queries.js";
import {
	priorityJump,
	priorityShift,
	reorder,
} from "../quest/verbs/reorder.js";
import type { QuestResult, QuestToolParams } from "../quest/verbs/shared.js";
import {
	concludeOrRetire,
	reopenQuest,
	stageTransition,
} from "../quest/verbs/stage.js";
import { reparent, undo } from "../quest/verbs/structural.js";
import {
	treeAdd,
	treeAdopt,
	treeExpand,
	treeList,
	treePrune,
} from "../quest/verbs/tree-ops.js";
import { registerBuiltinRefTypes } from "../refs/index.js";
import { registerBuiltinTerminalDrivers } from "../terminal/index.js";
import { registerBuiltinTreeProviders } from "../tree/index.js";

/**
 * Default questsRoot: the same location agentic-harness.pi's own
 * quest-workflow extension resolves to, so both hosts see the same
 * quest tree by default.
 */
function defaultQuestsRoot(
	env: NodeJS.ProcessEnv = process.env,
	home = homedir(),
): string {
	const override = env.XDG_DATA_HOME;
	const root =
		override && override.length > 0 ? override : join(home, ".local", "share");
	return join(root, "pi", "agentic-harness.pi", "quest-workflow", "quests");
}

function resolveQuestsRoot(flagValue: string | undefined): string {
	return (
		flagValue ?? process.env.AGENTIC_HARNESS_QUESTS_ROOT ?? defaultQuestsRoot()
	);
}

let registered = false;
function ensureRegistries(): void {
	if (registered) return;
	registerBuiltinRefTypes();
	registerBuiltinUrlFetchers();
	registerBuiltinTerminalDrivers();
	registerBuiltinTreeProviders();
	registered = true;
}

async function loadState(
	stateFile: string,
	questsRoot: string,
): Promise<QuestState> {
	let state: QuestState;
	try {
		const raw = await readFile(stateFile, "utf8");
		state = JSON.parse(raw) as QuestState;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		state = createQuestState({ questsRoot });
	}
	state.questsRoot = questsRoot;
	return state;
}

async function saveState(stateFile: string, state: QuestState): Promise<void> {
	await mkdir(dirname(stateFile), { recursive: true });
	await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

export interface QuestCliOptions {
	action: string;
	stateFile: string;
	questsRoot: string | undefined;
}

/**
 * Run one quest action: load state, dispatch, persist state, return
 * the result. `params` is the caller's full params bag (parsed from
 * stdin JSON by the caller); `action` is set on it from the CLI
 * argv so callers don't have to repeat it in the JSON body.
 */
export async function runQuestAction(
	options: QuestCliOptions,
	params: QuestToolParams,
): Promise<QuestResult> {
	ensureRegistries();
	const questsRoot = resolveQuestsRoot(options.questsRoot);
	const state = await loadState(options.stateFile, questsRoot);
	params.action = options.action;
	const result = await dispatch(state, options.action, params);
	await saveState(options.stateFile, state);
	return result;
}

async function dispatch(
	state: QuestState,
	action: string,
	params: QuestToolParams,
): Promise<QuestResult> {
	switch (action) {
		case "create":
			return create(state, params);
		case "load":
			return load(state, params);
		case "unload":
			return unload(state);
		case "show":
		case "status":
			return show(state, params);
		case "list":
			return list(state, params);
		case "focus":
			return focus(state, params);
		case "unfocus":
			return unfocus(state);
		case "think":
		case "draft":
		case "build":
			return stageTransition(state, action, params);
		case "conclude":
		case "retire":
			return concludeOrRetire(state, action, params);
		case "reopen":
			return reopenQuest(state);
		case "top":
		case "bottom":
		case "bump":
		case "sink":
		case "renumber":
		case "before":
		case "after":
			return reorder(state, params);
		case "reparent":
			return reparent(state, params);
		case "undo":
			return undo(state);
		case "alias-add":
			return aliasAdd(state, params);
		case "alias-remove":
			return aliasRemove(state, params);
		case "promote":
			return priorityShift(state, "up", params);
		case "demote":
			return priorityShift(state, "down", params);
		case "drive":
			return priorityJump(state, "driving" as QuestPriority);
		case "park":
			return priorityJump(state, "bench" as QuestPriority);
		case "defer":
			return priorityJump(state, "someday" as QuestPriority);
		case "reclassify":
			return reclassify(state, params);
		case "tree":
			return tree(state, params);
		case "tree-add":
			return treeAdd(state, params);
		case "tree-adopt":
			return treeAdopt(state, params);
		case "tree-list":
			return treeList(state);
		case "tree-prune":
			return treePrune(state, params);
		case "tree-expand":
			return treeExpand(state, params);
		case "expand":
			return expand(state, params);
		case "find":
			return find(state, params);
		case "who":
			return who(state, params);
		case "links":
			return linksAction(state, params);
		case "locate":
			return locate(state, params);
		case "ancestors":
			return ancestors(state, params);
		case "config":
			return {
				ok: true,
				message: `Quests root: ${state.questsRoot}`,
				details: { questsRoot: state.questsRoot },
			};
		default:
			return {
				ok: false,
				guidance: `Unknown action "${action}". See the CLI's quest skill for the full list.`,
			};
	}
}
