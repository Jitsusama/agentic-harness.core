import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const CLI = new URL("../../dist/bin/cli.js", import.meta.url).pathname;

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** Run the CLI with an isolated XDG_CONFIG_HOME, so this never reads or
 * writes the developer's own real Slack credentials. */
async function runIsolated(args: string[]): Promise<unknown> {
	const configHome = mkdtempSync(join(tmpdir(), "claude-slack-auth-"));
	dirs.push(configHome);
	const { stdout } = await execFileAsync(process.execPath, [CLI, ...args], {
		env: { ...process.env, XDG_CONFIG_HOME: configHome },
	});
	return JSON.parse(stdout.trim());
}

describe("slack-auth status", () => {
	it("reports not authenticated when no credentials are stored", async () => {
		const result = await runIsolated(["slack-auth", "status"]);
		expect(result).toEqual({ authenticated: false });
	});
});
