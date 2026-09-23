/**
 * Give each test run one temp directory, and remove it when the run
 * ends.
 *
 * Tests make scratch directories and git repos through `os.tmpdir()`,
 * and several never removed theirs: the git fixture template and the
 * stacked template live for a worker and are never deleted, and the
 * attribution tests keep no cleanup at all. A day of runs left dozens
 * of repos behind, each keeping a git fsmonitor daemon alive wherever
 * fsmonitor is on.
 *
 * This runs once in the main process, before any worker starts, so
 * pointing TMPDIR at the run's directory reaches every worker and
 * every process a test spawns. The teardown then removes whatever
 * they left, including anything a test written tomorrow forgets.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default function setup(): () => void {
	const previous = process.env.TMPDIR;
	const root = mkdtempSync(join(tmpdir(), "vitest-run-"));
	process.env.TMPDIR = root;
	return () => {
		if (previous === undefined) delete process.env.TMPDIR;
		else process.env.TMPDIR = previous;
		rmSync(root, { recursive: true, force: true });
	};
}
