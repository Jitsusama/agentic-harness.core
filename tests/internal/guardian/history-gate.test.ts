import { describe, expect, it } from "vitest";
import { detectDestructiveCommand } from "../../../internal/guardian/history-gate.js";

describe("detectDestructiveCommand", () => {
	it("detects each irrecoverable form", () => {
		for (const cmd of [
			"git push --force",
			"git reset --hard",
			"git clean -fd",
			"git branch -D feature",
			"git checkout -- .",
		]) {
			expect(detectDestructiveCommand(cmd)?.severity).toBe("irrecoverable");
		}
	});

	it("ignores a non-destructive command", () => {
		expect(detectDestructiveCommand("git status")).toBeNull();
		expect(detectDestructiveCommand("git commit -m x")).toBeNull();
	});

	it("grades --force-with-lease as risky and --force as irrecoverable", () => {
		// Ordering is load-bearing: the lease pattern must win over the
		// bare --force pattern, or a safer command is graded as the
		// harsher severity.
		expect(
			detectDestructiveCommand("git push --force-with-lease")?.severity,
		).toBe("risky");
		expect(detectDestructiveCommand("git push --force")?.severity).toBe(
			"irrecoverable",
		);
	});

	it("grades rebase as risky and reset --hard as irrecoverable", () => {
		expect(detectDestructiveCommand("git rebase -i HEAD~2")?.severity).toBe(
			"risky",
		);
		expect(detectDestructiveCommand("git reset --hard")?.severity).toBe(
			"irrecoverable",
		);
	});

	it("returns null for an undetected command", () => {
		expect(detectDestructiveCommand("git status")).toBeNull();
	});

	it("carries the description of the matched pattern", () => {
		expect(detectDestructiveCommand("git reset --hard")?.description).toBe(
			"Permanently discards all uncommitted changes.",
		);
	});

	it("carries the command back on the match", () => {
		expect(detectDestructiveCommand("git reset --hard")?.command).toBe(
			"git reset --hard",
		);
	});
});
