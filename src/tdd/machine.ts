/**
 * The TDD loop domain model and its pure reducer: a single,
 * discrete red-green-refactor loop.
 *
 * The agent drives the loop by attesting each transition. A
 * transition is allowed only when the attestation supplies the
 * justification the gate requires; otherwise the reducer refuses
 * and hands back guidance. The reducer never inspects code, test
 * output or file paths. It tracks the agent's own attestation,
 * which is the one contract that stays robust across every
 * language and every host this loop ever runs under.
 */

/** Where a loop sits in the red-green-refactor cycle. */
export type Phase = "idle" | "plan" | "write" | "red" | "green" | "refactor";

/** Whether a reported failure is a real assertion or noise. */
export type FailureKind = "assertion" | "other";

/** The live state of one discrete TDD loop. */
export interface Loop {
	phase: Phase;
	assertionFailure: boolean;
	behaviour: string | null;
	iteration: number;
}

/** The resting state: no loop in play. */
export function idleLoop(): Loop {
	return {
		phase: "idle",
		assertionFailure: false,
		behaviour: null,
		iteration: 0,
	};
}

/** Close the active loop back to idle, keeping the iteration count. */
function rest(loop: Loop): Loop {
	return {
		phase: "idle",
		assertionFailure: false,
		behaviour: null,
		iteration: loop.iteration,
	};
}

/** The transitions the agent can attest. */
export type Action =
	| "plan"
	| "write"
	| "red"
	| "green"
	| "refactor"
	| "done"
	| "abandon";

/** A transition request, carrying whatever justification it offers. */
export interface Attestation {
	action: Action;
	behaviour?: string;
	interface?: string;
	failure?: string;
	failureKind?: FailureKind;
	pass?: string;
	reflection?: string;
	reason?: string;
}

/** The reducer's own outcome: advance, or refuse with guidance. */
export type TransitionResult =
	| { ok: true; loop: Loop }
	| { ok: false; guidance: string };

/** Refuse a transition, handing the agent guidance on what's missing. */
function refuse(guidance: string): TransitionResult {
	return { ok: false, guidance };
}

/** Accept a transition into a new loop state. */
function advance(loop: Loop): TransitionResult {
	return { ok: true, loop };
}

/** Attempt a transition, enforcing the justification each gate requires. */
export function transition(
	loop: Loop,
	attestation: Attestation,
): TransitionResult {
	switch (attestation.action) {
		case "plan":
			return plan(loop, attestation);
		case "write":
			return write(loop, attestation);
		case "red":
			return red(loop, attestation);
		case "green":
			return green(loop, attestation);
		case "refactor":
			return refactor(loop);
		case "done":
			return done(loop, attestation);
		case "abandon":
			return abandon(loop, attestation);
		default:
			return refuse(
				`Unknown transition. Drive the loop with plan, write, red, ` +
					`green, refactor, done or abandon.`,
			);
	}
}

function plan(loop: Loop, attestation: Attestation): TransitionResult {
	if (loop.phase !== "idle") {
		return refuse(
			`Finish or abandon the current loop before planning another. You're in ${loop.phase}.`,
		);
	}
	if (!attestation.behaviour) {
		return refuse(
			"Name the single behaviour under test: the exported thing you " +
				"want to exist. One increment per loop.",
		);
	}
	return advance({
		phase: "plan",
		assertionFailure: false,
		behaviour: attestation.behaviour,
		iteration: loop.iteration + 1,
	});
}

function write(loop: Loop, attestation: Attestation): TransitionResult {
	if (loop.phase !== "plan") {
		return refuse(
			`Writing the test follows plan. You're in ${loop.phase}, not plan. ` +
				`Go forward, or abandon to redo.`,
		);
	}
	if (!attestation.interface) {
		return refuse(
			"State the exported surface this test binds to before writing it. " +
				"Tests document the interface, never the internals.",
		);
	}
	return advance({ ...loop, phase: "write" });
}

function red(loop: Loop, attestation: Attestation): TransitionResult {
	if (loop.phase !== "write" && loop.phase !== "red") {
		return refuse(
			`A failing test comes out of the write phase. You're in ${loop.phase}.`,
		);
	}
	if (!attestation.failure) {
		return refuse("Run the test and report the failure before moving to red.");
	}
	if (!attestation.failureKind) {
		return refuse(
			"Say whether the failure was an assertion or other (a compile or " +
				"missing-symbol error). Only a real assertion clears the way to green.",
		);
	}
	return advance({
		...loop,
		phase: "red",
		assertionFailure: attestation.failureKind === "assertion",
	});
}

function green(loop: Loop, attestation: Attestation): TransitionResult {
	if (loop.phase !== "red" || !loop.assertionFailure) {
		return refuse(
			"You haven't seen a real red yet. Stub a minimal skeleton, re-run, " +
				"and call red again with failureKind 'assertion' before green.",
		);
	}
	if (!attestation.pass) {
		return refuse("Report the passing result before moving to green.");
	}
	return advance({ ...loop, phase: "green", assertionFailure: false });
}

function refactor(loop: Loop): TransitionResult {
	if (loop.phase !== "green") {
		return refuse(`Refactoring follows a green test. You're in ${loop.phase}.`);
	}
	return advance({ ...loop, phase: "refactor" });
}

function done(loop: Loop, attestation: Attestation): TransitionResult {
	if (loop.phase !== "refactor") {
		return refuse(
			`Close the loop from the refactor phase, not ${loop.phase}. ` +
				`Pass through refactor first, even as a no-op.`,
		);
	}
	if (!attestation.reflection) {
		return refuse(
			"Before you close, say what you reconsidered about the internal and " +
				"external design now that a real consumer exists.",
		);
	}
	return advance(rest(loop));
}

function abandon(loop: Loop, attestation: Attestation): TransitionResult {
	if (loop.phase === "idle") {
		return refuse("There's no loop to abandon. Plan one when you're ready.");
	}
	if (!attestation.reason) {
		return refuse("Give a reason for leaving the loop before you abandon it.");
	}
	return advance(rest(loop));
}
