import { describe, expect, it } from "vitest";
import { attest } from "../../src/tdd/attest.js";
import { idleLoop, type Loop } from "../../src/tdd/machine.js";

function loop(overrides: Partial<Loop> = {}): Loop {
	return {
		phase: "plan",
		assertionFailure: false,
		behaviour: "rejects an empty cart",
		iteration: 1,
		...overrides,
	};
}

describe("attest", () => {
	it("advances and carries the new phase's discipline", () => {
		const result = attest(loop({ phase: "plan" }), {
			action: "write",
			interface: "Cart#checkout raises EmptyCartError",
		});

		expect(result.outcome).toBe("advanced");
		if (result.outcome === "advanced") {
			expect(result.loop.phase).toBe("write");
			expect(result.discipline).toMatch(/exported surface/i);
		}
	});

	it("refuses without advancing, and hands back guidance instead of discipline", () => {
		const held = loop({ phase: "plan" });

		const result = attest(held, { action: "write" });

		expect(result.outcome).toBe("refused");
		if (result.outcome === "refused") {
			expect(result.loop).toEqual(held);
			expect(result.guidance).toMatch(/exported surface|interface/i);
		}
	});

	it("never advances an unknown action", () => {
		const held = idleLoop();

		const result = attest(held, {
			action: "frobnicate" as unknown as "plan",
		});

		expect(result.outcome).toBe("refused");
		if (result.outcome === "refused") {
			expect(result.loop).toEqual(held);
		}
	});
});
