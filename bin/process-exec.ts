/**
 * A real `Exec`, spawning a child process.
 *
 * The one CLI-adapter concern this needs it for today is
 * runRedirectGate's own `subject.exec`, which asks git about the
 * checkout the way review's own git provider does, through a plain
 * process spawn rather than any richer runtime a host might offer,
 * since a stateless CLI invocation is not running inside one.
 *
 * It is `spawnExec`, so a git that wants a credential fails rather than
 * prompting on the terminal the hook was run from.
 */

import { type Exec, spawnExec } from "../exec/index.js";

/** Run a command as a real child process. Never throws: a spawn failure
 * (missing binary, ENOENT) reports as a non-zero code instead. */
export const processExec: Exec = spawnExec();
