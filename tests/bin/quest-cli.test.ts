import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runQuestAction } from "../../bin/quest.js";
import type { QuestToolParams } from "../../quest/verbs/shared.js";

let questsRoot: string;
let stateFile: string;

function run(action: string, params: Partial<QuestToolParams> = {}) {
	return runQuestAction({ action, stateFile, questsRoot }, {
		action,
		...params,
	} as QuestToolParams);
}

beforeEach(() => {
	questsRoot = mkdtempSync(join(tmpdir(), "quest-cli-root-"));
	stateFile = join(
		mkdtempSync(join(tmpdir(), "quest-cli-state-")),
		"state.json",
	);
});

afterEach(() => {
	rmSync(questsRoot, { recursive: true, force: true });
});

describe("quest CLI, create/load/show/list", () => {
	it("refuses create with no title", async () => {
		const result = await run("create", { kind: "sidequest" });
		expect(result.ok).toBe(false);
	});

	it("creates a quest and loads it", async () => {
		const created = await run("create", { title: "Ship the thing" });
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const id = created.details?.id as string;
		expect(id).toMatch(/^QEST-/);

		// State persists across calls: show with no id reads the loaded quest.
		const shown = await run("show");
		expect(shown.ok).toBe(true);
		expect(shown.ok && shown.message).toContain(id);
	});

	it("lists created quests", async () => {
		await run("create", { title: "First" });
		await run("create", { title: "Second" });
		const listed = await run("list");
		expect(listed.ok).toBe(true);
		expect(listed.ok && (listed.details?.total as number)).toBe(2);
	});

	it("loads a quest by id after unload", async () => {
		const created = await run("create", { title: "Reload me" });
		const id = (created.ok && (created.details?.id as string)) || "";
		await run("unload");
		const loaded = await run("load", { id });
		expect(loaded.ok).toBe(true);
		expect(loaded.ok && loaded.details?.id).toBe(id);
	});

	it("refuses show when nothing is loaded and no id given", async () => {
		const result = await run("show");
		expect(result.ok).toBe(false);
	});
});

describe("quest CLI, document stage machine", () => {
	it("drives think -> draft -> build -> conclude on a document", async () => {
		await run("create", { title: "Stage test" });
		const think = await run("think", { note: "Investigating", kind: "plan" });
		expect(think.ok).toBe(true);
		const draft = await run("draft", { title: "The plan" });
		expect(draft.ok).toBe(true);
		expect(draft.ok && draft.details?.id).toMatch(/^PLAN-/);
		const build = await run("build");
		expect(build.ok).toBe(true);
		expect(build.ok && build.message).toMatch(
			/^Now building against plan PLAN-\S+\.$/,
		);
		const conclude = await run("conclude");
		expect(conclude.ok).toBe(true);
		expect(conclude.ok && conclude.message).toMatch(
			/^plan PLAN-\S+ is now concluded\.$/,
		);
	});

	it("reopens a concluded quest", async () => {
		await run("create", { title: "Reopen test" });
		const conclude = await run("conclude", { scope: "quest" });
		expect(conclude.ok).toBe(true);
		const reopen = await run("reopen");
		expect(reopen.ok).toBe(true);
	});
});

describe("quest CLI, focus/unfocus", () => {
	it("focuses and unfocuses a drafted document", async () => {
		await run("create", { title: "Focus test" });
		await run("think", { note: "note", kind: "plan" });
		const draft = await run("draft", { title: "Focus plan" });
		const id = (draft.ok && (draft.details?.id as string)) || "";
		await run("unfocus");
		const focused = await run("focus", { id });
		expect(focused.ok).toBe(true);
		const unfocused = await run("unfocus");
		expect(unfocused.ok).toBe(true);
	});
});

describe("quest CLI, reorder and priority", () => {
	it("promotes and demotes the loaded quest's priority", async () => {
		await run("create", { title: "Priority test", priority: "active" });
		const promoted = await run("promote");
		expect(promoted.ok).toBe(true);
		const demoted = await run("demote");
		expect(demoted.ok).toBe(true);
	});

	it("drives, parks and defers the loaded quest", async () => {
		await run("create", { title: "Bucket test" });
		expect((await run("drive")).ok).toBe(true);
		expect((await run("park")).ok).toBe(true);
		expect((await run("defer")).ok).toBe(true);
	});

	it("reorders siblings with top/bottom", async () => {
		await run("create", { title: "A" });
		await run("create", { title: "B" });
		const top = await run("top");
		expect(top.ok).toBe(true);
	});
});

describe("quest CLI, alias, reparent and undo", () => {
	it("adds and removes an alias", async () => {
		await run("create", { title: "Alias test" });
		const added = await run("alias-add", { ref: "github:example/repo" });
		expect(added.ok).toBe(true);
		const removed = await run("alias-remove", { ref: "github:example/repo" });
		expect(removed.ok).toBe(true);
	});

	it("reparents a quest and reverses it with undo", async () => {
		const parent = await run("create", { title: "Parent" });
		const parentId = (parent.ok && (parent.details?.id as string)) || "";
		const child = await run("create", { title: "Child" });
		const childId = (child.ok && (child.details?.id as string)) || "";
		const reparented = await run("reparent", {
			id: childId,
			parent: parentId,
		});
		expect(reparented.ok).toBe(true);
		const undone = await run("undo");
		expect(undone.ok).toBe(true);
	});

	it("reclassifies the loaded quest's kind", async () => {
		await run("create", { title: "Kind test", kind: "sidequest" });
		const reclassified = await run("reclassify", { kind: "quest" });
		expect(reclassified.ok).toBe(true);
	});
});

describe("quest CLI, queries", () => {
	it("finds quests by free text", async () => {
		await run("create", { title: "Findable Quest" });
		const found = await run("find", { query: "Findable" });
		expect(found.ok).toBe(true);
		expect(found.ok && (found.details?.total as number)).toBe(1);
	});

	it("renders the whole tree and an expanded subtree", async () => {
		const parent = await run("create", { title: "Root" });
		const parentId = (parent.ok && (parent.details?.id as string)) || "";
		await run("create", { title: "Leaf", parent: parentId });
		const whole = await run("tree");
		expect(whole.ok).toBe(true);
		const expanded = await run("expand", { id: parentId });
		expect(expanded.ok).toBe(true);
	});

	it("walks the ancestor chain", async () => {
		const parent = await run("create", { title: "Ancestor root" });
		const parentId = (parent.ok && (parent.details?.id as string)) || "";
		const child = await run("create", {
			title: "Descendant",
			parent: parentId,
		});
		const childId = (child.ok && (child.details?.id as string)) || "";
		const chain = await run("ancestors", { id: childId });
		expect(chain.ok).toBe(true);
		expect(chain.ok && (chain.details?.ancestors as unknown[])?.length).toBe(1);
	});

	it("locates a quest by id", async () => {
		const created = await run("create", { title: "Locate me" });
		const id = (created.ok && (created.details?.id as string)) || "";
		const located = await run("locate", { id });
		expect(located.ok).toBe(true);
	});

	it("reports outgoing and incoming links for the loaded quest", async () => {
		await run("create", { title: "Links test" });
		const links = await run("links");
		expect(links.ok).toBe(true);
	});

	it("finds cast bullets across quests with who", async () => {
		const result = await run("who");
		expect(result.ok).toBe(true);
	});
});

describe("quest CLI, config and unknown actions", () => {
	it("reports the resolved quests root", async () => {
		const result = await run("config");
		expect(result.ok).toBe(true);
		expect(result.ok && result.details?.questsRoot).toBe(questsRoot);
	});

	it("refuses an unknown action with guidance", async () => {
		const result = await run("not-a-real-action");
		expect(result.ok).toBe(false);
	});
});

describe("quest CLI, tree-ops against a real git repo", () => {
	let repoRoot: string;

	beforeEach(async () => {
		const { execFile } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const exec = promisify(execFile);
		repoRoot = mkdtempSync(join(tmpdir(), "quest-cli-repo-"));
		await exec("git", ["init", "-q", "-b", "main"], { cwd: repoRoot });
		await exec("git", ["config", "user.email", "t@t"], { cwd: repoRoot });
		await exec("git", ["config", "user.name", "t"], { cwd: repoRoot });
		await exec("git", ["config", "commit.gpgsign", "false"], { cwd: repoRoot });
		writeFileSync(join(repoRoot, "README.md"), "hi\n");
		await exec("git", ["add", "README.md"], { cwd: repoRoot });
		await exec("git", ["commit", "-q", "-m", "seed"], { cwd: repoRoot });
	});

	afterEach(() => {
		rmSync(repoRoot, { recursive: true, force: true });
	});

	it("adds, lists and prunes a scaffolded worktree", async () => {
		await run("create", { title: "Tree test" });
		const added = await run("tree-add", { cwd: repoRoot, name: "feature" });
		expect(added.ok).toBe(true);
		const listed = await run("tree-list");
		expect(listed.ok).toBe(true);
		const pruned = await run("tree-prune");
		expect(pruned.ok).toBe(true);
	});

	it("adopts an existing tree without scaffolding one", async () => {
		await run("create", { title: "Adopt test" });
		// repoRoot is the repo's main working tree, so adopting it needs
		// force -- adopting a shared main checkout is a deliberate act.
		const adopted = await run("tree-adopt", { cwd: repoRoot, force: true });
		expect(adopted.ok).toBe(true);
	});
});
