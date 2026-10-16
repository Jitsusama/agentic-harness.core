import { describe, expect, it } from "vitest";
import {
	detectShapeViolations,
	formatShapeBlock,
	PR_SECTIONS,
	PR_SHAPE,
} from "../../sections/index.js";

const [TLDR, PROBLEM, SOLUTION, VALIDATION] = PR_SECTIONS;

/** A body that keeps every rule, to be broken one section at a time. */
function body(parts: Partial<Record<string, string>> = {}): string {
	const text = {
		[TLDR]: "Merging with a short commit id now works the first time.",
		[PROBLEM]: "Merging failed 23 times in two months.",
		[SOLUTION]:
			"Merge expands a short id before it asks GitHub, because GitHub accepts only the full id.",
		[VALIDATION]:
			"A new test sends a short id and checks the full one arrives.",
		...parts,
	};
	return PR_SECTIONS.map((h) => `${h}\n\n${text[h]}`).join("\n\n");
}

const found = (b: string) =>
	detectShapeViolations(b, PR_SHAPE).map((v) => ({
		section: v.section,
		rule: v.rule,
		word: v.word,
	}));

describe("wording rules", () => {
	it("passes a body that says how much, why and what was checked", () => {
		expect(found(body())).toEqual([]);
	});

	it("refuses a TL;DR that claims every case without a count", () => {
		expect(
			found(body({ [TLDR]: "Most guards now let work go ahead." })),
		).toContainEqual({
			section: TLDR,
			rule: "unscoped",
			word: "Most",
		});
	});

	it("lets a TL;DR quantify when it gives the count or the exception", () => {
		expect(
			found(body({ [TLDR]: "All nine guards now let work go ahead." })),
		).toEqual([]);
		expect(
			found(body({ [TLDR]: "Every guard except commit now reports." })),
		).toEqual([]);
		expect(
			found(body({ [TLDR]: "It now works every time, after all." })),
		).toEqual([]);
	});

	it("leaves a universal in the Solution alone, where it cannot be counted", () => {
		expect(
			found(
				body({
					[SOLUTION]:
						"Every compaction now reports what it did, so nothing is lost.",
				}),
			),
		).toEqual([]);
	});

	it("refuses a TL;DR that opens with the PR, tells its history or uses bold", () => {
		const rules = found(
			body({
				[TLDR]: "This PR makes **merging** work, after we tried a retry.",
			}),
		).map((v) => v.rule);
		expect(rules).toEqual(
			expect.arrayContaining(["opener", "emphasis", "history"]),
		);
	});

	it("refuses a Solution whose prose never says why", () => {
		expect(
			found(
				body({ [SOLUTION]: "Merge expands a short id before it asks GitHub." }),
			),
		).toContainEqual({
			section: SOLUTION,
			rule: "noReason",
			word: "",
		});
	});

	it("refuses list items that all open the same way", () => {
		const list =
			"Three changes, so each tool recovers:\n- Adds a retry\n- Adds a restart\n- Adds a lock";
		expect(found(body({ [SOLUTION]: list })).map((v) => v.rule)).toContain(
			"repeatedOpener",
		);
	});

	it("refuses Validation that hedges, assures or passes without naming the check", () => {
		const rules = found(
			body({
				[VALIDATION]:
					"It should work in production. The change is thoroughly tested. All tests pass.",
			}),
		).map((v) => v.rule);
		expect(rules).toEqual(["hedge", "assurance", "barePass"]);
	});

	it("accepts a pass that names how many tests ran", () => {
		expect(
			found(
				body({ [VALIDATION]: "The 412 tests pass, including the new one." }),
			),
		).toEqual([]);
	});

	it("refuses a pointer at the session and a selling word in any section", () => {
		const rules = found(
			body({ [PROBLEM]: "As discussed, merging was significantly broken." }),
		).map((v) => v.rule);
		expect(rules).toEqual(["conversation", "selling"]);
	});

	it("says which word broke the rule and what to write instead", () => {
		const message = formatShapeBlock(
			detectShapeViolations(
				body({ [TLDR]: "Most guards now let work go ahead." }),
				PR_SHAPE,
			),
			"pull request",
			"github-pr-format",
		);
		expect(message).toContain('"Most"');
		expect(message).toContain("give the count or name the set");
	});

	it("quotes a short sentence whole, without marking it as cut", () => {
		const message = formatShapeBlock(
			detectShapeViolations(
				body({ [VALIDATION]: "It should work." }),
				PR_SHAPE,
			),
			"pull request",
			"github-pr-format",
		);
		expect(message).toContain('("It should work")');
		expect(message).not.toContain("work.");
	});
});
