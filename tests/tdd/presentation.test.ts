import { describe, expect, it } from "vitest";
import type { Loop } from "../../src/tdd/machine.js";
import { glyph, visualState } from "../../src/tdd/presentation.js";

function loop(overrides: Partial<Loop> = {}): Loop {
	return {
		phase: "plan",
		assertionFailure: false,
		behaviour: null,
		iteration: 1,
		...overrides,
	};
}

describe("visualState", () => {
	it("reads the plain phases straight through", () => {
		expect(visualState(loop({ phase: "idle" }))).toBe("idle");
		expect(visualState(loop({ phase: "plan" }))).toBe("plan");
		expect(visualState(loop({ phase: "write" }))).toBe("write");
		expect(visualState(loop({ phase: "green" }))).toBe("green");
		expect(visualState(loop({ phase: "refactor" }))).toBe("refactor");
	});

	it("splits red by whether the failure was a verified assertion", () => {
		expect(visualState(loop({ phase: "red", assertionFailure: false }))).toBe(
			"red-unverified",
		);
		expect(visualState(loop({ phase: "red", assertionFailure: true }))).toBe(
			"red-verified",
		);
	});
});

describe("glyph", () => {
	it("fills the circle as the test materializes, then transforms", () => {
		expect(glyph("idle")).toEqual({ char: "◌", token: "dim" });
		expect(glyph("plan")).toEqual({ char: "○", token: "warning" });
		expect(glyph("write")).toEqual({ char: "◔", token: "warning" });
		expect(glyph("red-unverified")).toEqual({ char: "◑", token: "error" });
		expect(glyph("red-verified")).toEqual({ char: "◕", token: "error" });
		expect(glyph("green")).toEqual({ char: "●", token: "success" });
		expect(glyph("refactor")).toEqual({ char: "◉", token: "accent" });
	});

	it("gives write and red-unverified distinct shapes, not just colours", () => {
		expect(glyph("write").char).not.toBe(glyph("red-unverified").char);
	});
});
