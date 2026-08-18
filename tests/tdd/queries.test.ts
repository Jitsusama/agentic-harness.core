import { describe, expect, it } from "vitest";
import { idleLoop, type Loop } from "../../src/tdd/machine.js";
import { standingReminder } from "../../src/tdd/queries.js";

function loop(overrides: Partial<Loop> = {}): Loop {
	return {
		phase: "plan",
		assertionFailure: false,
		behaviour: "rejects an empty cart",
		iteration: 1,
		...overrides,
	};
}

describe("standingReminder", () => {
	it("reports the iteration, phase and behaviour, not the discipline", () => {
		const reminder = standingReminder(loop({ phase: "write", iteration: 2 }));

		expect(reminder).toContain("write");
		expect(reminder).toContain("2");
		expect(reminder).toContain("rejects an empty cart");
		expect(reminder).not.toContain("exported surface");
	});

	it("stays silent when no loop is active", () => {
		expect(standingReminder(idleLoop())).toBeUndefined();
	});

	it("stays silent while resting between loops", () => {
		expect(standingReminder(loop({ phase: "idle" }))).toBeUndefined();
	});

	it("omits the behaviour line when none is set", () => {
		const reminder = standingReminder(loop({ phase: "red", behaviour: null }));

		expect(reminder).toContain("red");
		expect(reminder).not.toContain("Increment under test");
	});
});
