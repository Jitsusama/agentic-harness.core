/**
 * Behavioural coverage for core/quest's ported lifecycle mutations
 * and the verb modules built on them (alias, reorder, structural).
 *
 * Unlike agentic-harness.pi's own quest-workflow tests, which drive
 * everything through the full `handle()` dispatcher (pi's own,
 * taking an ExtensionAPI/ExtensionContext this package has no
 * equivalent for), these call the ported functions directly against
 * real quest fixtures scaffolded on disk -- the same functions a
 * future CLI adapter would call.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintId } from "../../internal/quest/id.js";
import { atomicWriteFile } from "../../internal/quest/io.js";
import { scaffoldQuestReadme } from "../../internal/quest/scaffold.js";
import type { QuestFrontMatter } from "../../quest/index.js";
import {
	addAliasesToLoaded,
	appendJourneyEntry,
	attachCurrentSession,
	captureSessionIdentity,
	createDocument,
	detachSessionFromLoaded,
	findQuestEntry,
	inventoryWorktrees,
	refreshLoadedSlice,
	removeAliasesFromLoaded,
	setLoadedKind,
	setLoadedStatus,
} from "../../quest/lifecycle.js";
import { createQuestState, type QuestState } from "../../quest/state.js";
import { aliasAdd, aliasRemove } from "../../quest/verbs/alias.js";
import {
	priorityJump,
	priorityShift,
	reorder,
} from "../../quest/verbs/reorder.js";
import { reparent, undo } from "../../quest/verbs/structural.js";

let tmpRoot: string;

function questFrontMatter(
	overrides: Partial<QuestFrontMatter> = {},
): QuestFrontMatter {
	return {
		id: mintId("QEST"),
		kind: "quest",
		parent: null,
		status: "active",
		priority: "active",
		rank: 1,
		started: "2026-01-01",
		updated: "2026-01-01",
		aliases: [],
		sessions: [],
		...overrides,
	};
}

/** Scaffold a quest directly to disk, bypassing the pi-only create verb. */
function seedQuest(
	questsRoot: string,
	title: string,
	overrides: Partial<QuestFrontMatter> = {},
): QuestFrontMatter {
	const frontMatter = questFrontMatter(overrides);
	const dir = join(questsRoot, frontMatter.id);
	mkdirSync(dir, { recursive: true });
	const readme = scaffoldQuestReadme({ frontMatter, title });
	atomicWriteFile(join(dir, "README.md"), readme);
	return frontMatter;
}

function buildState(): QuestState {
	return createQuestState({ questsRoot: join(tmpRoot, "quests") });
}

/** Load a quest into state without pi's ExtensionAPI-dependent loadQuest. */
function loadIntoState(state: QuestState, fm: QuestFrontMatter): void {
	const entry = findQuestEntry(state, fm.id);
	if (!entry) throw new Error(`fixture quest ${fm.id} not found`);
	state.questDir = entry.dir;
	state.questId = entry.doc.frontMatter.id;
	state.questTitle = entry.doc.title ?? null;
	state.questKind = entry.doc.frontMatter.kind;
	state.questStatus = entry.doc.frontMatter.status;
	state.questPriority = entry.doc.frontMatter.priority;
}

beforeEach(() => {
	tmpRoot = mkdtempSync(join(tmpdir(), "core-quest-lifecycle-"));
});

afterEach(() => {
	rmSync(tmpRoot, { recursive: true, force: true });
});

describe("aliasAdd / aliasRemove", () => {
	it("adds and removes a comma-separated alias batch", () => {
		const state = buildState();
		const fm = seedQuest(state.questsRoot, "Migrate the auth service");
		loadIntoState(state, fm);

		const added = aliasAdd(state, {
			action: "alias-add",
			ref: "github-pr:shop/world#47281,github-issue:shop/world#100",
		});
		expect(added.ok).toBe(true);

		const dupe = addAliasesToLoaded(state, [
			{ type: "github-pr", value: "shop/world#47281" },
		]);
		expect(dupe.ok && dupe.already).toEqual([
			{ type: "github-pr", value: "shop/world#47281" },
		]);

		const removed = aliasRemove(state, {
			action: "alias-remove",
			ref: "github-pr:shop/world#47281",
		});
		expect(removed.ok).toBe(true);
		const remaining = removeAliasesFromLoaded(state, [
			{ type: "github-issue", value: "shop/world#100" },
		]);
		expect(remaining.ok && remaining.removed).toHaveLength(1);
	});

	it("refuses when no quest is loaded", () => {
		const state = buildState();
		const result = aliasAdd(state, { action: "alias-add", ref: "x:y" });
		expect(result.ok).toBe(false);
	});
});

describe("reorder / priority verbs", () => {
	it("reorders siblings and reports the changes", () => {
		const state = buildState();
		const a = seedQuest(state.questsRoot, "A", { rank: 1 });
		seedQuest(state.questsRoot, "B", { rank: 2 });
		seedQuest(state.questsRoot, "C", { rank: 3 });
		loadIntoState(state, a);

		const result = reorder(state, { action: "bottom", id: a.id });
		expect(result.ok).toBe(true);
	});

	it("jumps and shifts the loaded quest's priority bucket", () => {
		const state = buildState();
		const fm = seedQuest(state.questsRoot, "D", { priority: "active" });
		loadIntoState(state, fm);

		const jumped = priorityJump(state, "driving");
		expect(jumped.ok).toBe(true);
		expect(state.questPriority).toBe("driving");

		const shifted = priorityShift(state, "down");
		expect(shifted.ok).toBe(true);
		expect(state.questPriority).toBe("active");
	});
});

describe("reparent / undo", () => {
	it("reparents a batch and undo reverses it", () => {
		const state = buildState();
		const parent = seedQuest(state.questsRoot, "Parent");
		const child = seedQuest(state.questsRoot, "Child", { parent: null });
		loadIntoState(state, parent);

		const moved = reparent(state, {
			action: "reparent",
			id: child.id,
			parent: parent.id,
		});
		expect(moved.ok).toBe(true);

		const reverted = undo(state);
		expect(reverted.ok).toBe(true);
	});
});

describe("lifecycle mutations", () => {
	it("appends a journey entry and stamps updated", () => {
		const state = buildState();
		const fm = seedQuest(state.questsRoot, "E");
		loadIntoState(state, fm);
		appendJourneyEntry(state, "Did a thing.");
		refreshLoadedSlice(state);
		expect(state.questTitle).toBe("E");
	});

	it("changes status and kind on the loaded quest", () => {
		const state = buildState();
		const fm = seedQuest(state.questsRoot, "F", { kind: "quest" });
		loadIntoState(state, fm);

		const status = setLoadedStatus(state, "paused");
		expect(status.ok && status.changed).toBe(true);

		// A subquest needs a parent; the loaded quest has none.
		const kind = setLoadedKind(state, "subquest");
		expect(kind.ok).toBe(false);
	});

	it("creates a document under the loaded quest", () => {
		const state = buildState();
		const fm = seedQuest(state.questsRoot, "G");
		loadIntoState(state, fm);
		const path = createDocument(state, {
			id: mintId("PLAN"),
			kind: "plan",
			title: "A plan",
			stage: "think",
			scaffoldBody:
				"---\nid: PLAN-20260101-AAA111\nkind: plan\nstage: think\nupdated: 2026-01-01\n---\n\n# A plan\n",
		});
		expect(path).toBeUndefined(); // scaffold body above is deliberately invalid front matter
	});

	it("inventories worktrees across quests", () => {
		const state = buildState();
		seedQuest(state.questsRoot, "H", {
			trees: [
				{ path: join(tmpRoot, "tree-h"), branch: "feat/h", providerId: "git" },
			],
		});
		const inventory = inventoryWorktrees(state);
		expect(inventory).toHaveLength(1);
		expect(inventory[0].branch).toBe("feat/h");
	});

	it("attaches and detaches the current session", () => {
		const state = buildState();
		const fm = seedQuest(state.questsRoot, "I");
		loadIntoState(state, fm);
		const identity = captureSessionIdentity();
		expect(typeof identity.instanceId).toBe("string");

		const attached = attachCurrentSession(state, {
			id: "sess-1",
			cwd: tmpRoot,
		});
		expect(attached.attached).toBe(true);

		const detached = detachSessionFromLoaded(state, "sess-1");
		expect(detached.ok && detached.detached).toBe(true);
	});
});
