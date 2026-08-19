/**
 * Public API for the `verify` domain: run the project's check
 * command and report whether it still builds and passes.
 *
 * This is the "on request" layer only. pi also has a fast,
 * turn-boundary auto-verify layer backed by a resident LSP client
 * it keeps running; that has no equivalent adapter-side resource
 * here (a hook process has no shared LSP session to query), so it
 * stays pi-only rather than being approximated into something
 * slower and heavier than what it replaces.
 */

export type { ProjectInfo } from "./project.js";
export { detectPackageManager, findProject } from "./project.js";
export type { CheckCommandSources, ResolvedCheck } from "./resolve.js";
export { resolveCheckCommand } from "./resolve.js";
export type { RunVerifyOptions, VerifyOutcome } from "./run.js";
export { runVerify, stripAnsi, truncate } from "./run.js";
