import { describe, expect, it } from "vitest";
import {
	ATTACHMENT_LIMITS,
	attachmentNameProblem,
	attachmentProblem,
	questRecordPath,
} from "../../../internal/quest/record.js";

describe("attachmentProblem", () => {
	const text = new TextEncoder().encode("# notes\n");
	const png = new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
	]);
	const file = (rel: string, size: number, head: Uint8Array = text) => ({
		rel,
		kind: "file" as const,
		size,
		head,
	});
	const MiB = 1024 * 1024;

	it("accepts text and raster images within their limits", () => {
		for (const candidate of [
			file("attachments/notes.md", MiB),
			file("attachments/runs/a/summary.csv", 10),
			file("attachments/diagram.svg", 200_000),
			file("attachments/probe.py", 4_000),
			file("attachments/cost.png", 5 * MiB, png),
			file("attachments/photo.JPG", 3 * MiB, png),
		]) {
			expect(attachmentProblem(candidate), candidate.rel).toBeUndefined();
		}
	});

	it("accepts a folder, which only holds attachments", () => {
		expect(
			attachmentProblem({
				rel: "attachments/runs",
				kind: "directory",
				size: 0,
				head: new Uint8Array(),
			}),
		).toBeUndefined();
	});

	it("says why a file cannot be an attachment", () => {
		const cases: [
			(
				| ReturnType<typeof file>
				| {
						rel: string;
						kind: "symlink" | "directory";
						size: number;
						head: Uint8Array;
				  }
			),
			string,
		][] = [
			[
				{ rel: "attachments/link.md", kind: "symlink", size: 0, head: text },
				"not-a-file",
			],
			[
				{
					rel: "attachments/repo/.git",
					kind: "directory",
					size: 0,
					head: new Uint8Array(),
				},
				"in-a-checkout",
			],
			[file("attachments/repo/.git/config", 100), "in-a-checkout"],
			[file("attachments/events.jsonl", 100), "raw-data"],
			[file("attachments/run.log", 100), "raw-data"],
			[file("attachments/dump.tar.gz", 100), "raw-data"],
			[file("attachments/state.sqlite", 100), "raw-data"],
			[file("attachments/objects.pack", 100), "raw-data"],
			[file("attachments/blob", 100, new Uint8Array([1, 0, 2])), "binary"],
			[
				file("attachments/report.pdf", 100, new Uint8Array([0x25, 0x50, 0, 1])),
				"binary",
			],
			[file("attachments/notes.md", MiB + 1), "too-large"],
			[file("attachments/cost.png", 5 * MiB + 1, png), "too-large"],
		];
		for (const [candidate, reason] of cases) {
			expect(attachmentProblem(candidate)?.reason, candidate.rel).toBe(reason);
		}
	});

	it("names the limit a file went over", () => {
		expect(
			attachmentProblem(file("attachments/notes.md", 2 * MiB))?.detail,
		).toBe("2.0 MiB of text, over the 1 MiB limit");
		expect(ATTACHMENT_LIMITS).toEqual({
			textBytes: MiB,
			imageBytes: 5 * MiB,
			sniffBytes: 8192,
		});
	});

	it("answers from the name alone what the name decides", () => {
		expect(attachmentNameProblem("attachments/events.jsonl")?.reason).toBe(
			"raw-data",
		);
		expect(attachmentNameProblem("attachments/r/.git/HEAD")?.reason).toBe(
			"in-a-checkout",
		);
		expect(attachmentNameProblem("attachments/notes.md")).toBeUndefined();
		expect(attachmentNameProblem("attachments/blob")).toBeUndefined();
	});
});

describe("questRecordPath", () => {
	const root = "/quests";
	const quest = "QEST-20260924-ABC123";
	const at = (rel: string) => `${root}/${quest}${rel ? `/${rel}` : ""}`;

	it("names what each path in a quest folder is", () => {
		const cases: [string, string][] = [
			["", "quest"],
			["README.md", "readme"],
			["plans/PLAN-20260924-RUE4Q4.md", "document"],
			["research/RSCH-20260923-MBRVN1.md", "document"],
			["briefs/BRIF-20260901-AAAAAA.md", "document"],
			["reports/RPRT-20260923-9JE9OQ.md", "document"],
			["plans", "folder"],
			["attachments", "folder"],
			["attachments/cost.png", "attachment"],
			["attachments/runs/2026-09-24/summary.md", "attachment"],
			["plans/notes.md", "stray"],
			["plans/PLAN-20260924-RUE4Q4.md.bak", "stray"],
			["plans/QEST-20260924-ABC123.md", "stray"],
			["plans/sub/PLAN-20260924-RUE4Q4.md", "stray"],
			["PLAN-20260924-RUE4Q4.md", "stray"],
			["evidence/disk/PROPOSAL.md", "stray"],
			["scratch", "stray"],
			["README.md.orig", "stray"],
		];
		for (const [rel, place] of cases) {
			expect(questRecordPath(root, at(rel)), rel).toEqual({
				quest,
				questDir: at(""),
				rel,
				place,
			});
		}
	});

	it("reads a path that is not yet normalized", () => {
		expect(
			questRecordPath(root, `${root}/${quest}/plans/../attachments/./a.png`),
		).toMatchObject({ rel: "attachments/a.png", place: "attachment" });
	});

	it("says nothing about a path outside every quest", () => {
		for (const path of [
			"/elsewhere/QEST-20260924-ABC123/README.md",
			"/quests",
			"/quests/index.json",
			"/quests/not-a-quest/README.md",
			"/questsX/QEST-20260924-ABC123/README.md",
		]) {
			expect(questRecordPath(root, path), path).toBeUndefined();
		}
	});
});
