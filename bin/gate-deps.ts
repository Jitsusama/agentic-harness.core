/**
 * Claude Code's file-backed content-gate signature store.
 *
 * The prose, section and title gates need to remember which
 * violation signatures they have already blocked, so a repeat of
 * the same violation relents instead of looping forever - see
 * gate/deps.ts for why. pi backs this with its session log; a
 * PreToolUse hook is a stateless-per-invocation process with no
 * session object to read one back from, so this backs it with a
 * small JSON file instead, the same shape tdd's and quest's own
 * state files already use.
 *
 * Scoped to the command's effective cwd rather than to a Claude
 * Code conversation: a hook invocation carries no session id in
 * its stdin payload, so there is nothing session-shaped to key on.
 * The signature persists for the project instead, which changes
 * "relent on a repeat within this session" to "relent on a repeat
 * within this project, ever" - a reasonable reading given the
 * alternative is no relent mechanism at all in this adapter.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GateDeps } from "../gate/index.js";

/** Where signatures persist, relative to the resolved cwd. */
const SIGNATURES_FILE = ".agentic-harness/gate-signatures.json";

/** Read the persisted signature list, or an empty one if absent or unreadable. */
function readSignatureFile(path: string): string[] {
	try {
		const raw = readFileSync(path, "utf8");
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((s): s is string => typeof s === "string")
			: [];
	} catch {
		// Missing or corrupt: no signatures recorded yet, not a failure
		// worth surfacing to the caller.
		return [];
	}
}

/** Build a GateDeps backed by a JSON file under `cwd`. */
export function fileGateDeps(cwd: string): GateDeps {
	const path = join(cwd, SIGNATURES_FILE);
	return {
		readSignatures: () => readSignatureFile(path),
		persistSignature: (signature) => {
			const signatures = readSignatureFile(path);
			if (signatures.includes(signature)) return;
			signatures.push(signature);
			try {
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, JSON.stringify(signatures));
			} catch {
				// Best-effort: a lost signature only means the loop
				// breaker forgets a block it already made, not that the
				// gate itself fails to run.
			}
		},
	};
}
