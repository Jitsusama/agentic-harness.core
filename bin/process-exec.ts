/**
 * A real `Exec`, spawning a child process.
 *
 * The one CLI-adapter concern this needs it for today is
 * runRedirectGate's own `subject.exec`, which asks git about the
 * checkout the way review's own git provider does — but through a
 * plain process spawn rather than through any richer runtime a host
 * might otherwise offer, since a stateless CLI invocation is not
 * running inside one.
 */

import { execFile } from "node:child_process";
import type { Exec, ExecResult } from "../exec/index.js";

/** Run a command as a real child process. Never throws: a spawn failure
 * (missing binary, ENOENT) reports as a non-zero code instead. */
export const processExec: Exec = (command, args) =>
	new Promise<ExecResult>((resolve) => {
		execFile(command, args, (error, stdout, stderr) => {
			if (!error) {
				resolve({ code: 0, stdout, stderr });
				return;
			}
			// A real exit code is a number; a spawn failure (ENOENT, no
			// permission) carries a string error code instead, and there
			// is no process exit code to report, so it counts as failed.
			const exitCode = (error as NodeJS.ErrnoException & { code?: unknown })
				.code;
			resolve({
				code: typeof exitCode === "number" ? exitCode : 1,
				stdout,
				stderr,
			});
		});
	});
