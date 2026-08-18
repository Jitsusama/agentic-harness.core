/**
 * Public API for the `tdd` domain: drive a single, discrete
 * red-green-refactor loop by attesting each transition.
 *
 * Deliberately not exported here: persistence (each adapter's
 * job — pi via its session log, a CLI via a small state file it
 * owns) and rendering (`./presentation`, for hosts with a
 * scoreboard).
 */

export { type AttestResult, attest } from "./attest.js";
export { disciplineFor } from "./discipline.js";
export type {
	Action,
	Attestation,
	FailureKind,
	Loop,
	Phase,
} from "./machine.js";
export { idleLoop } from "./machine.js";
export { standingReminder } from "./queries.js";
