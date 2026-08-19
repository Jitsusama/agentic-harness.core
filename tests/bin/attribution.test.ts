import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	checkAttribution,
	ensureAttributionHook,
} from "../../bin/attribution.js";

const dirs: string[] = [];

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), "claude-attribution-"));
	dirs.push(repo);
	execFileSync("git", ["-C", repo, "init", "-q"]);
	execFileSync("git", ["-C", repo, "config", "user.email", "t@example.com"]);
	execFileSync("git", ["-C", repo, "config", "user.name", "Tester"]);
	return repo;
}

afterEach(() => {
	dirs.length = 0;
});

describe("ensureAttributionHook", () => {
	it("installs a hook that attributes a real commit via the marker file", () => {
		const repo = initRepo();

		ensureAttributionHook(repo);

		writeFileSync(join(repo, "f.txt"), "hi");
		execFileSync("git", ["-C", repo, "add", "."]);
		execFileSync("git", ["-C", repo, "commit", "-m", "feat: thing"]);

		const log = execFileSync("git", ["-C", repo, "log", "-1", "--pretty=%B"], {
			encoding: "utf8",
		});
		expect(log).toContain("Co-Authored-By: AI via Claude Code");
	});

	it("is a no-op outside any git repo", () => {
		const loose = mkdtempSync(join(tmpdir(), "claude-attribution-loose-"));
		dirs.push(loose);

		expect(() => ensureAttributionHook(loose)).not.toThrow();
	});

	it("is idempotent: the marker file survives a second call unchanged", () => {
		const repo = initRepo();

		ensureAttributionHook(repo);
		ensureAttributionHook(repo);

		const hooksDir = execFileSync(
			"git",
			["-C", repo, "rev-parse", "--git-path", "hooks"],
			{ encoding: "utf8" },
		).trim();
		const marker = readFileSync(
			join(repo, hooksDir, "agentic-harness-claude-co-author"),
			"utf8",
		);
		expect(marker).toContain("Co-Authored-By: AI via Claude Code");
	});
});

describe("checkAttribution", () => {
	it("names the corrected command for an unattributed gh pr create", () => {
		const reason = checkAttribution(
			"gh pr create --title x --body-file - <<'EOF'\nbody\nEOF",
		);

		expect(reason).toContain("Retry with:");
		expect(reason).toContain("Co-Authored-By AI via [Claude Code]");
	});

	it("says nothing for a command that is already attributed", () => {
		const reason = checkAttribution(
			"gh pr create --title x --body-file - <<'EOF'\nbody\n\n---\nCo-Authored-By AI via test\nEOF",
		);

		expect(reason).toBeNull();
	});

	it("says nothing for a command with no gh entity in it", () => {
		expect(checkAttribution("git status")).toBeNull();
	});

	it("blocks a gh command it cannot splice safely, naming why", () => {
		const reason = checkAttribution("gh pr create --body plain");

		expect(reason).toContain("cannot be applied");
	});
});
