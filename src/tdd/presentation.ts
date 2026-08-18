/**
 * The visual vocabulary of a TDD scoreboard: one glyph per state
 * of the loop. The circle fills monotonically across the five
 * build-up states (empty, quarter, half, three-quarter, full), so
 * every state is a distinct shape and the progression reads
 * without colour. Green is the full circle: the test is complete.
 * Refactor leaves the circle family for a diamond because it is a
 * different kind of activity, not another notch of the same
 * build-up. Fill encodes progress, colour reinforces meaning, and
 * shape alone keeps the states apart.
 *
 * This is presentation, not domain: a host with no scoreboard
 * (a Claude Code skill, a bare CLI) never needs to import it. It
 * is a separate export specifically so it stays optional.
 */

import type { Loop } from "./machine.js";

/** The seven distinct states the scoreboard can show. */
export type VisualState =
	| "idle"
	| "plan"
	| "write"
	| "red-unverified"
	| "red-verified"
	| "green"
	| "refactor";

/** Collapse a loop's phase and assertion verification into one visual state. */
export function visualState(loop: Loop): VisualState {
	if (loop.phase === "red") {
		return loop.assertionFailure ? "red-verified" : "red-unverified";
	}
	return loop.phase;
}

/**
 * The theme tokens a scoreboard paints with. A narrow, host-agnostic
 * vocabulary an adapter maps onto its own palette: yellow for
 * authoring, red for failing, green for passing, blue for
 * refactoring and dim for idle.
 */
export type GlyphToken = "dim" | "warning" | "error" | "success" | "accent";

/** A glyph and the colour it should be painted in. */
export interface Glyph {
	char: string;
	token: GlyphToken;
}

const GLYPHS: Record<VisualState, Glyph> = {
	idle: { char: "◌", token: "dim" },
	plan: { char: "○", token: "warning" },
	write: { char: "◔", token: "warning" },
	"red-unverified": { char: "◑", token: "error" },
	"red-verified": { char: "◕", token: "error" },
	green: { char: "●", token: "success" },
	// A circle with a centre: the same family as the phases before it,
	// since refactoring is the last of them and not a different kind of
	// thing.
	refactor: { char: "◉", token: "accent" },
};

/** The glyph and colour for a visual state. */
export function glyph(state: VisualState): Glyph {
	return GLYPHS[state];
}
