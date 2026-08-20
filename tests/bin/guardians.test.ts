import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileGateDeps } from "../../bin/gate-deps.js";
import {
	checkCommitGuardian,
	checkIssueGuardian,
	checkPrGuardian,
} from "../../bin/guardians.js";
import type { Exec } from "../../exec/index.js";

const dirs: string[] = [];

function tempDeps() {
	const dir = mkdtempSync(join(tmpdir(), "claude-guardians-"));
	dirs.push(dir);
	return { dir, deps: fileGateDeps(dir) };
}

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** An exec that answers as though the checkout has no remote at all,
 * the case runRedirectGate treats as "cannot tell, so don't redirect". */
const noRemoteExec: Exec = async () => ({
	code: 128,
	stdout: "",
	stderr: "fatal: not a git repository",
});

describe("checkCommitGuardian", () => {
	it("returns null for a non-commit command", () => {
		const { deps } = tempDeps();
		expect(checkCommitGuardian("git status", deps)).toBeNull();
	});

	it("returns null for a commit with no extractable message", () => {
		const { deps } = tempDeps();
		expect(
			checkCommitGuardian("git commit -F missing-file.txt", deps),
		).toBeNull();
	});

	it("denies a commit whose message trips the prose gate", () => {
		const { deps } = tempDeps();
		const result = checkCommitGuardian(
			'git commit -m "feat: use an em-dash — here"',
			deps,
		);
		expect(result?.decision).toBe("deny");
	});

	it("asks with the message and format notes for a non-conventional subject", () => {
		const { deps } = tempDeps();
		const result = checkCommitGuardian('git commit -m "fix stuff"', deps);
		expect(result?.decision).toBe("ask");
		expect(result?.reason).toContain("fix stuff");
		expect(result?.reason).toContain("Format notes:");
		expect(result?.reason).toContain("not conventional");
	});

	it("asks and reports a clean format for a conventional subject", () => {
		const { deps } = tempDeps();
		const result = checkCommitGuardian(
			'git commit -m "fix: correct the thing"',
			deps,
		);
		expect(result?.decision).toBe("ask");
		expect(result?.reason).toContain("Format looks clean");
	});

	it("notes an amend in the ask reason", () => {
		const { deps } = tempDeps();
		const result = checkCommitGuardian(
			'git commit --amend -m "fix: correct the thing"',
			deps,
		);
		expect(result?.decision).toBe("ask");
		expect(result?.reason).toContain("amends the previous commit");
	});

	it("surfaces the relented prose violation in the ask reason on retry, not just format notes", () => {
		const { deps } = tempDeps();
		const message = 'git commit -m "fix: use an em-dash — here"';
		expect(checkCommitGuardian(message, deps)?.decision).toBe("deny");

		const retry = checkCommitGuardian(message, deps);
		expect(retry?.decision).toBe("ask");
		expect(retry?.reason).toContain("still breaks prose-standard");
		expect(retry?.reason).toContain("emdash");
	});
});

const VALID_PR_BODY = [
	"### 🌐 Situation",
	"Something happened.",
	"",
	"### 🔧 Resolution",
	"Fixed it.",
	"",
	"### 🔬 Validation",
	"Tested it.",
].join("\n");

const VALID_ISSUE_BODY = [
	"### 🌐 Situation",
	"Something happened.",
	"",
	"### 🎯 Outcome",
	"Wanted result.",
	"",
	"### ✅ Acceptance",
	"Criteria met.",
].join("\n");

function ghCommand(kind: "pr" | "issue", title: string, body: string): string {
	return `gh ${kind} create --title "${title}" --body-file - <<'EOF'\n${body}\nEOF`;
}

describe("checkPrGuardian", () => {
	it("returns null for a non-PR command", () => {
		const { deps } = tempDeps();
		expect(
			checkPrGuardian("git status", "/tmp", deps, noRemoteExec),
		).resolves.toBeNull();
	});

	it("denies a PR body missing a sanctioned section", async () => {
		const { deps } = tempDeps();
		const result = await checkPrGuardian(
			ghCommand("pr", "Fix the Login Bug", "Just a plain body."),
			"/tmp",
			deps,
			noRemoteExec,
		);
		expect(result?.decision).toBe("deny");
		expect(result?.reason).toContain("section");
	});

	it("asks with the title and body once the PR clears every gate", async () => {
		const { deps } = tempDeps();
		const result = await checkPrGuardian(
			ghCommand("pr", "Fix the Login Bug", VALID_PR_BODY),
			"/tmp",
			deps,
			noRemoteExec,
		);
		expect(result?.decision).toBe("ask");
		expect(result?.reason).toContain("Fix the Login Bug");
		expect(result?.reason).toContain("Tested it.");
	});
});

describe("checkIssueGuardian", () => {
	it("returns null for a non-issue command", () => {
		const { deps } = tempDeps();
		expect(checkIssueGuardian("git status", deps)).toBeNull();
	});

	it("denies an issue body missing a sanctioned section", () => {
		const { deps } = tempDeps();
		const result = checkIssueGuardian(
			ghCommand("issue", "Login Is Broken", "Just a plain body."),
			deps,
		);
		expect(result?.decision).toBe("deny");
		expect(result?.reason).toContain("section");
	});

	it("asks with the title and body once the issue clears every gate", () => {
		const { deps } = tempDeps();
		const result = checkIssueGuardian(
			ghCommand("issue", "Login Is Broken", VALID_ISSUE_BODY),
			deps,
		);
		expect(result?.decision).toBe("ask");
		expect(result?.reason).toContain("Login Is Broken");
		expect(result?.reason).toContain("Criteria met.");
	});
});
