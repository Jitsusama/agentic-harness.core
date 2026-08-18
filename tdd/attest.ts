/**
 * The one command this domain exposes: attest a transition
 * against the current loop. Pure, synchronous, no I/O — a
 * discriminated result the caller pattern-matches on. Persisting
 * the returned loop between calls, and deciding how its own host
 * surfaces `discipline`/`guidance`, is entirely the adapter's job.
 */

import { disciplineFor } from "./discipline.js";
import type { Attestation, Loop } from "./machine.js";
import { transition } from "./machine.js";

export type { Attestation, Loop };

/** The outcome of attesting one transition: advanced, or refused unchanged. */
export type AttestResult =
	| { outcome: "advanced"; loop: Loop; discipline: string }
	| { outcome: "refused"; loop: Loop; guidance: string };

/** Attempt a transition, enforcing the justification each gate requires. */
export function attest(loop: Loop, attestation: Attestation): AttestResult {
	const result = transition(loop, attestation);
	if (!result.ok) {
		return { outcome: "refused", loop, guidance: result.guidance };
	}
	return {
		outcome: "advanced",
		loop: result.loop,
		discipline: disciplineFor(result.loop.phase),
	};
}
