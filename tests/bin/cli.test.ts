import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Exercises the built CLI, not the TypeScript source: this is the
// artifact `bin` actually points at, and the one thing this test
// suite can't take on faith from the unit tests alone.
const CLI = new URL("../../dist/bin/cli.js", import.meta.url).pathname;

let dir: string;
let stateFile: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "agentic-harness-core-cli-"));
	stateFile = join(dir, "tdd-loop.json");
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function run(args: string[], stdin?: string) {
	const child = spawn(process.execPath, [
		CLI,
		...args,
		"--state-file",
		stateFile,
	]);
	if (stdin !== undefined) {
		child.stdin.write(stdin);
	}
	child.stdin.end();

	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});

	const exitCode: number = await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 0));
	});
	if (exitCode !== 0) {
		throw new Error(`CLI exited ${exitCode}: ${stderr}`);
	}
	return JSON.parse(stdout.trim());
}

describe("tdd status", () => {
	it("reports an idle loop when no state file exists yet", async () => {
		const result = await run(["tdd", "status"]);
		expect(result.loop).toEqual({
			phase: "idle",
			assertionFailure: false,
			behaviour: null,
			iteration: 0,
		});
		expect(result.reminder).toBeUndefined();
	});
});

describe("tdd attest", () => {
	it("advances the loop and persists it for the next invocation", async () => {
		const planned = await run(
			["tdd", "attest"],
			JSON.stringify({ action: "plan", behaviour: "rejects an empty cart" }),
		);
		expect(planned.outcome).toBe("advanced");
		expect(planned.loop.phase).toBe("plan");

		const status = await run(["tdd", "status"]);
		expect(status.loop.phase).toBe("plan");
		expect(status.reminder).toContain("rejects an empty cart");
	});

	it("refuses without mutating the persisted state", async () => {
		await run(
			["tdd", "attest"],
			JSON.stringify({ action: "plan", behaviour: "rejects an empty cart" }),
		);

		const refused = await run(
			["tdd", "attest"],
			JSON.stringify({ action: "write" }),
		);
		expect(refused.outcome).toBe("refused");

		const status = await run(["tdd", "status"]);
		expect(status.loop.phase).toBe("plan");
	});
});

async function runHook(stdin: string): Promise<string> {
	// cwd is the isolated temp dir from beforeEach, not this repo: the
	// hook installs a real git commit-msg hook as a side effect, and
	// running it from the real project directory would install one
	// here for real (this bit a real run once).
	const child = spawn(process.execPath, [CLI, "hook", "pre-bash"], {
		cwd: dir,
	});
	child.stdin.write(stdin);
	child.stdin.end();

	let stdout = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", resolve);
	});
	return stdout.trim();
}

describe("hook pre-bash", () => {
	it("denies a flagged git command with a reason", async () => {
		const output = await runHook(
			JSON.stringify({
				tool_name: "Bash",
				tool_input: { command: "git commit --amend -m fix" },
			}),
		);
		const parsed = JSON.parse(output);
		expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
		expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
			"--amend",
		);
	});

	it("denies a flagged gh command with a reason", async () => {
		const output = await runHook(
			JSON.stringify({
				tool_name: "Bash",
				tool_input: { command: "gh pr create --title x --body y" },
			}),
		);
		const parsed = JSON.parse(output);
		expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
			"inline body",
		);
	});

	it("says nothing for a clean bash command, deferring to the normal flow", async () => {
		const output = await runHook(
			JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls -la" } }),
		);
		expect(output).toBe("");
	});

	it("says nothing for a non-Bash tool call", async () => {
		const output = await runHook(
			JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "x" } }),
		);
		expect(output).toBe("");
	});

	it("denies an unattributed gh pr create, naming the corrected command", async () => {
		const output = await runHook(
			JSON.stringify({
				tool_name: "Bash",
				tool_input: {
					command: "gh pr create --title x --body-file - <<'EOF'\nbody\nEOF",
				},
			}),
		);
		const parsed = JSON.parse(output);
		expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
			"Co-Authored-By AI via [Claude Code]",
		);
	});

	it("asks before an irrecoverable git command, naming the risk", async () => {
		const output = await runHook(
			JSON.stringify({
				tool_name: "Bash",
				tool_input: { command: "git reset --hard" },
			}),
		);
		const parsed = JSON.parse(output);
		expect(parsed.hookSpecificOutput.permissionDecision).toBe("ask");
		expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
			"Destructive command",
		);
		expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
			"discards all uncommitted changes",
		);
	});

	it("asks before a risky git command, naming it as recoverable", async () => {
		const output = await runHook(
			JSON.stringify({
				tool_name: "Bash",
				tool_input: { command: "git rebase -i HEAD~2" },
			}),
		);
		const parsed = JSON.parse(output);
		expect(parsed.hookSpecificOutput.permissionDecision).toBe("ask");
		expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
			"Risky command",
		);
	});

	it("denies rather than asks when a command trips both a hard rule and a destructive pattern", async () => {
		// The compound call trips checkGitCli (a commit chained with a
		// state change) and the push --force also matches a destructive
		// pattern; the precedence is the point, a hard rule must never
		// soften to a question just because a destructive pattern also
		// matched.
		const output = await runHook(
			JSON.stringify({
				tool_name: "Bash",
				tool_input: { command: "git commit -m x && git push --force" },
			}),
		);
		const parsed = JSON.parse(output);
		expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
	});
});

async function runMemory(args: string[], stdin: string) {
	// XDG_STATE_HOME points at the isolated temp dir from beforeEach,
	// not the real one: memory writes a real, persistent SQLite file
	// there, and this suite must never touch the developer's own
	// memory database.
	const child = spawn(process.execPath, [CLI, "memory", ...args], {
		env: { ...process.env, XDG_STATE_HOME: dir },
	});
	child.stdin.write(stdin);
	child.stdin.end();

	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const exitCode: number = await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 0));
	});
	if (exitCode !== 0) {
		throw new Error(`CLI exited ${exitCode}: ${stderr}`);
	}
	return JSON.parse(stdout.trim());
}

describe("memory", () => {
	it("retains, recalls and reflects on a fact end to end", async () => {
		const retained = await runMemory(
			["retain"],
			JSON.stringify({ text: "the deploy key lives in .env.deploy" }),
		);
		expect(retained.id).toBeGreaterThan(0);

		const recalled = await runMemory(["recall"], "{}");
		expect(recalled).toHaveLength(1);
		expect(recalled[0].text).toBe("the deploy key lives in .env.deploy");

		const reflected = await runMemory(
			["reflect"],
			JSON.stringify({ question: "where is the deploy key" }),
		);
		expect(reflected.text).toContain("the deploy key lives in .env.deploy");
	});

	it("edits a fact's text", async () => {
		const retained = await runMemory(
			["retain"],
			JSON.stringify({ text: "wrong" }),
		);

		const edited = await runMemory(
			["edit"],
			JSON.stringify({ id: retained.id, text: "right" }),
		);

		expect(edited.ok).toBe(true);
		expect(edited.fact.text).toBe("right");
	});

	it("invalidates a fact so it stops being recalled", async () => {
		const retained = await runMemory(
			["retain"],
			JSON.stringify({ text: "temporary" }),
		);

		const invalidated = await runMemory(
			["edit"],
			JSON.stringify({ id: retained.id, invalidate: true }),
		);
		expect(invalidated.ok).toBe(true);

		const recalled = await runMemory(["recall"], "{}");
		expect(recalled).toEqual([]);
	});

	it("scopes facts to the project at cwd by default", async () => {
		const retained = await runMemory(
			["retain"],
			JSON.stringify({ text: "scoped fact" }),
		);

		expect(retained.scope).toBe(`project:${process.cwd()}`);
	});
});
