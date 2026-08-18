/**
 * Read-only queries over a loop, for an adapter to surface
 * however its own host wants: pi via a context/message event,
 * a CLI via a status subcommand, a Claude Code hook via whatever
 * text it prepends. The information is host-agnostic; only the
 * delivery mechanism differs.
 */

import type { Loop } from "./machine.js";

/** Whether a loop is live: past idle, with a transition in play. */
function isActiveLoop(loop: Loop): boolean {
	return loop.phase !== "idle";
}

/** The standing reminder of where the loop is, or nothing at idle. */
export function standingReminder(loop: Loop): string | undefined {
	if (!isActiveLoop(loop)) {
		return undefined;
	}
	const lines = [`TDD loop ${loop.iteration}, ${loop.phase} phase.`];
	if (loop.behaviour) {
		lines.push(`Increment under test: ${loop.behaviour}.`);
	}
	return lines.join("\n");
}
