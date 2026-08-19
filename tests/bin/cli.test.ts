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
	const child = spawn(process.execPath, [CLI, "hook", "pre-bash"]);
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
});
