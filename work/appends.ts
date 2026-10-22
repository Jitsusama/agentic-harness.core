/**
 * Settling a replay's conflicts where both sides only added text.
 *
 * A Markdown log both branches append to (a history, a decision list, a
 * testing log) conflicts on every replay, because git sees two additions at
 * the same place and will not choose an order. Of 38 rebases in one repo's
 * reflogs, 18 met a Markdown conflict and 17 of those were nothing else: the
 * base side of every conflict was empty. Agents settled each one by hand the
 * same way, keeping both and putting the branch's after what had landed.
 *
 * So a conflict in a Markdown file is settled here when, and only when, every
 * conflict in that file is a pure addition on both sides. The side already
 * landed comes first and the side being replayed follows it. A conflict that
 * touches a line the base had is someone's judgement, and is left for them.
 *
 * Numbered entries are the other half. In 11 of those 17, both sides added the
 * same number (two `## 127.` sections, two `D186` decisions), because each was
 * written as the next free number when its branch was cut. The landed side
 * keeps its number and the replayed side's entries move up to the next free
 * ones, which is what the agents did and what "number may change at merge"
 * promises. Their citations move with them, and that is sound for one reason:
 * a number both sides added since their fork can never be cited by the
 * replayed branch meaning the landed entry, since the branch never saw it.
 * So every citation of that number in a line the replayed commit added means
 * its own entry. Lines added by the branch's other commits cannot be rewritten
 * mid-replay, so once the replay ends any still citing an old number are
 * named rather than left to be found.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Exec } from "../exec/index.js";

/** One entry the replayed side moved to a free number, as a reader cites it. */
export interface Renumbered {
	readonly from: string;
	readonly to: string;
}

/** A file settled by keeping both sides' additions. */
export interface SettledFile {
	readonly path: string;
	/** How many places both sides added at. */
	readonly hunks: number;
	readonly renumbered: readonly Renumbered[];
	/** Other files whose citations of a moved number were rewritten. */
	readonly cited: readonly string[];
}

/** A line the branch added that still cites a number its entry moved off. */
export interface StaleCitation {
	readonly path: string;
	readonly line: number;
	readonly cites: string;
}

/** A number move with what it takes to find its citations again. */
export interface Move {
	/** The file the entry lives in, from the top of the tree. */
	readonly path: string;
	/** Letters before the number (`D` in `D186`), or empty for a bare one. */
	readonly prefix: string;
	readonly from: number;
	readonly to: number;
}

/**
 * Marker length for the three-way merge's output, far past git's own seven so
 * a document that shows conflict markers as examples is never misread.
 */
const MARKER_SIZE = 41;

/** What git's three-way merge said, split into agreed text and conflicts. */
type Piece =
	| { readonly kind: "same"; readonly lines: readonly string[] }
	| {
			readonly kind: "conflict";
			readonly ours: readonly string[];
			readonly base: readonly string[];
			readonly theirs: readonly string[];
	  };

/** Split text into lines, each keeping its own ending. */
function linesOf(text: string): string[] {
	return text === "" ? [] : text.split(/(?<=\n)/);
}

/** Which marker a line is, at `MARKER_SIZE`, if any. */
function markerOf(line: string): "<" | "|" | "=" | ">" | undefined {
	const char = line[0];
	if (char !== "<" && char !== "|" && char !== "=" && char !== ">")
		return undefined;
	if (!line.startsWith(char.repeat(MARKER_SIZE))) return undefined;
	const after = line[MARKER_SIZE];
	if (after === char) return undefined;
	if (after !== undefined && after !== " " && after !== "\n" && after !== "\r")
		return undefined;
	return char;
}

/**
 * Read `git merge-file --zdiff3` output into pieces, or undefined when its
 * markers do not nest the way git writes them.
 */
export function readMerge(text: string): Piece[] | undefined {
	const pieces: Piece[] = [];
	let same: string[] = [];
	let side: "ours" | "base" | "theirs" | undefined;
	let ours: string[] = [];
	let base: string[] = [];
	let theirs: string[] = [];
	for (const line of linesOf(text)) {
		const marker = markerOf(line);
		if (side === undefined) {
			if (marker === undefined) {
				same.push(line);
				continue;
			}
			if (marker !== "<") return undefined;
			if (same.length > 0) pieces.push({ kind: "same", lines: same });
			same = [];
			side = "ours";
			ours = [];
			base = [];
			theirs = [];
			continue;
		}
		if (marker === "|" && side === "ours") side = "base";
		else if (marker === "=" && side === "base") side = "theirs";
		else if (marker === ">" && side === "theirs") {
			pieces.push({ kind: "conflict", ours, base, theirs });
			side = undefined;
		} else if (marker !== undefined) return undefined;
		else if (side === "ours") ours.push(line);
		else if (side === "base") base.push(line);
		else theirs.push(line);
	}
	if (side !== undefined) return undefined;
	if (same.length > 0) pieces.push({ kind: "same", lines: same });
	return pieces;
}

/** A numbered heading (`## 127.`) or a bold numbered bullet (`- **D186`). */
const HEADING_LABEL = /^(#{1,6}[ \t]+)([A-Z]{0,4}-?)(\d+)(?=[.:)](?:\s|$))/;
const BULLET_LABEL = /^([-*+][ \t]+\*\*)([A-Z]{1,4}-?)(\d+)(?!\d)/;

/** The entry label a line opens with, if it opens one. */
function labelOf(
	line: string,
): { lead: string; prefix: string; number: number } | undefined {
	const found = HEADING_LABEL.exec(line) ?? BULLET_LABEL.exec(line);
	if (!found) return undefined;
	const [, lead = "", prefix = "", digits = ""] = found;
	return { lead, prefix, number: Number.parseInt(digits, 10) };
}

/** Rewrite a label line's number, keeping everything around it. */
function relabel(line: string, to: number): string {
	const found = labelOf(line);
	if (!found) return line;
	const at = found.lead.length + found.prefix.length;
	const digits = String(found.number).length;
	return `${line.slice(0, at)}${to}${line.slice(at + digits)}`;
}

/**
 * Join a merge whose every conflict is two additions: the landed side first,
 * then the replayed side with its colliding entries moved to free numbers.
 * Undefined when any conflict touches the base, which is not ours to settle.
 */
export function joinAdditions(
	pieces: readonly Piece[],
	path: string,
):
	| { lines: string[]; theirs: Set<number>; hunks: number; moves: Move[] }
	| undefined {
	const conflicts = pieces.filter((piece) => piece.kind === "conflict");
	if (conflicts.length === 0) return undefined;
	if (conflicts.some((piece) => piece.base.some((line) => line.trim() !== "")))
		return undefined;

	const key = (prefix: string, number: number) => `${prefix}\0${number}`;
	const landed = new Set<string>();
	const highest = new Map<string, number>();
	const note = (prefix: string, number: number) =>
		highest.set(prefix, Math.max(highest.get(prefix) ?? 0, number));
	for (const piece of pieces) {
		const lines = piece.kind === "same" ? piece.lines : piece.ours;
		for (const line of lines) {
			const label = labelOf(line);
			if (!label) continue;
			note(label.prefix, label.number);
			if (piece.kind === "conflict")
				landed.add(key(label.prefix, label.number));
		}
	}

	// The replayed side's entries, in order, by namespace.
	const claimed = new Map<string, number[]>();
	for (const piece of conflicts) {
		for (const line of piece.theirs) {
			const label = labelOf(line);
			if (!label) continue;
			const list = claimed.get(label.prefix) ?? [];
			if (!list.includes(label.number)) list.push(label.number);
			claimed.set(label.prefix, list);
		}
	}

	// A namespace moves only where the two sides claimed the same number. From
	// the first collision up, the replayed entries take the next free numbers
	// in the order they appear, so they stay one run after what landed.
	const moving = new Map<string, Map<number, number>>();
	const moves: Move[] = [];
	for (const [prefix, numbers] of claimed) {
		const collided = numbers.filter((n) => landed.has(key(prefix, n)));
		if (collided.length === 0) continue;
		const from = Math.min(...collided);
		const staying = numbers.filter((n) => n < from);
		let next = Math.max(highest.get(prefix) ?? 0, ...staying) + 1;
		const map = new Map<number, number>();
		for (const n of numbers.filter((n) => n >= from)) {
			map.set(n, next);
			moves.push({ path, prefix, from: n, to: next });
			next += 1;
		}
		moving.set(prefix, map);
	}

	const lines: string[] = [];
	const theirs = new Set<number>();
	for (const piece of pieces) {
		if (piece.kind === "same") {
			lines.push(...piece.lines);
			continue;
		}
		const ours = [...piece.ours];
		const last = ours.at(-1);
		if (last !== undefined && !last.endsWith("\n"))
			ours[ours.length - 1] = `${last}\n`;
		lines.push(...ours);
		const first = piece.theirs[0];
		const ending = last?.endsWith("\r\n") ? "\r\n" : "\n";
		// Markdown needs a blank line between two blocks, and each side's block
		// starts and ends at its own text once the common lines are moved out.
		if (
			last !== undefined &&
			last.trim() !== "" &&
			first !== undefined &&
			first.trim() !== ""
		)
			lines.push(ending);
		for (const line of piece.theirs) {
			const label = labelOf(line);
			const to = label
				? moving.get(label.prefix)?.get(label.number)
				: undefined;
			theirs.add(lines.length);
			lines.push(to === undefined ? line : relabel(line, to));
		}
	}
	return { lines, theirs, hunks: conflicts.length, moves };
}

/** How a reader cites a moved entry: `HISTORY §127`, or `D186`. */
export function citedAs(path: string, prefix: string, number: number): string {
	return prefix === ""
		? `${basename(path).replace(/\.md$/i, "")} §${number}`
		: `${prefix}${number}`;
}

/** Escape text for use inside a regular expression. */
function literal(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The pattern that finds a citation of `number` in `file`. A lettered
 * number is cited the same way anywhere; a bare one is cited as `§127` in
 * its own file and as `HISTORY §127` everywhere else.
 */
function citationPattern(move: Move, number: number, file: string): RegExp {
	if (move.prefix !== "")
		return new RegExp(
			`(?<![A-Za-z0-9-])(${literal(move.prefix)})${number}(?![A-Za-z0-9])`,
			"g",
		);
	const stem = basename(move.path).replace(/\.md$/i, "");
	const lead = file === move.path ? "" : `${literal(stem)}[ \\t]+`;
	return new RegExp(
		`(?<![A-Za-z0-9])(${lead}§[ \\t]?)${number}(?![A-Za-z0-9])`,
		"g",
	);
}

/** A private-use character, held in place of a number until every move is found. */
const HOLD = "\uE000";

/**
 * Rewrite every citation of a moved number in one line, all at once, so a
 * move from 127 to 128 and another from 128 to 129 cannot chain.
 */
export function recite(
	line: string,
	moves: readonly Move[],
	file: string,
): string {
	let out = line;
	moves.forEach((move, index) => {
		out = out.replace(
			citationPattern(move, move.from, file),
			(_, lead: string) => `${lead}${HOLD}${index}${HOLD}`,
		);
	});
	return out.replace(/\uE000(\d+)\uE000/g, (_, index: string) => {
		const move = moves[Number.parseInt(index, 10)];
		return move === undefined ? "" : String(move.to);
	});
}

/** Lines a diff added, by file, with their line numbers in the new side. */
export function addedLines(
	diff: string,
): Map<string, { line: number; text: string }[]> {
	const files = new Map<string, { line: number; text: string }[]>();
	let file: string | undefined;
	let at = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ ")) {
			const named = line.slice(4);
			file = named.startsWith("b/") ? named.slice(2) : undefined;
			continue;
		}
		if (line.startsWith("--- ")) continue;
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunk) {
			at = Number.parseInt(hunk[1] ?? "0", 10);
			continue;
		}
		if (file === undefined) continue;
		if (line.startsWith("+")) {
			const list = files.get(file) ?? [];
			list.push({ line: at, text: line.slice(1) });
			files.set(file, list);
			at += 1;
		} else if (line.startsWith(" ")) at += 1;
	}
	return files;
}

/**
 * Lines the branch added that still cite a number one of its entries moved
 * off. A number that is also some move's new number is left out, since a
 * line citing it may be one already rewritten.
 */
export function staleIn(diff: string, moves: readonly Move[]): StaleCitation[] {
	const stale: StaleCitation[] = [];
	const landing = new Set(moves.map((m) => `${m.path}\0${m.prefix}\0${m.to}`));
	const live = moves.filter(
		(m) => !landing.has(`${m.path}\0${m.prefix}\0${m.from}`),
	);
	for (const [file, lines] of addedLines(diff)) {
		for (const { line, text } of lines) {
			for (const move of live) {
				if (citationPattern(move, move.from, file).test(text))
					stale.push({
						path: file,
						line,
						cites: citedAs(move.path, move.prefix, move.from),
					});
			}
		}
	}
	return stale;
}

/** Run git in the tree, answering its output or undefined when it fails. */
async function git(
	exec: Exec,
	treePath: string,
	args: readonly string[],
): Promise<string | undefined> {
	const result = await exec("git", ["-C", treePath, ...args]);
	return result.code === 0 ? result.stdout : undefined;
}

/** A conflict marker as git writes it into the working tree. */
const GIT_MARKER = /^(?:<{7}|>{7}|\|{7})(?:[ \t]|$)/m;

/**
 * Markdown paths unmerged with all three stages, from the top of the tree,
 * whose working copy still holds git's markers. One without them has been
 * edited by whoever is settling it, and recomputing it would throw their
 * edit away.
 */
async function appendable(
	exec: Exec,
	treePath: string,
	top: string,
): Promise<string[]> {
	const listed = await git(exec, treePath, [
		"ls-files",
		"-u",
		"-z",
		"--full-name",
		"--",
		":(top)",
	]);
	if (listed === undefined) return [];
	const stages = new Map<string, Set<string>>();
	for (const entry of listed.split("\0")) {
		const tab = entry.indexOf("\t");
		if (tab < 0) continue;
		const stage = entry.slice(0, tab).split(" ")[2] ?? "";
		const path = entry.slice(tab + 1);
		stages.set(path, (stages.get(path) ?? new Set()).add(stage));
	}
	return [...stages]
		.filter(
			([path, have]) =>
				/\.md$/i.test(path) && have.has("1") && have.has("2") && have.has("3"),
		)
		.map(([path]) => path)
		.filter((path) => {
			try {
				return GIT_MARKER.test(readFileSync(join(top, path), "utf8"));
			} catch {
				return false;
			}
		});
}

/**
 * Settle every conflicted Markdown file in a halted replay whose conflicts
 * are all additions on both sides, staging each one, and rewrite the halted
 * commit's own citations of any entry that moved. Answers what it settled,
 * which is nothing when no file qualifies, and never fails the halt: a file
 * it cannot read or write is left conflicted, as git left it.
 */
export async function settleAdditions(
	exec: Exec,
	treePath: string,
): Promise<{ settled: SettledFile[]; moves: Move[] }> {
	const settled: SettledFile[] = [];
	const moves: Move[] = [];
	const top = (
		await git(exec, treePath, ["rev-parse", "--show-toplevel"])
	)?.trim();
	if (!top) return { settled, moves };

	const joined: {
		path: string;
		lines: string[];
		theirs: Set<number>;
		hunks: number;
		moves: Move[];
	}[] = [];
	for (const path of await appendable(exec, treePath, top)) {
		// In a replay, stage 2 is what has landed and stage 3 the commit replayed.
		const merged = await exec("git", [
			"-C",
			treePath,
			"merge-file",
			"-p",
			"--zdiff3",
			`--marker-size=${MARKER_SIZE}`,
			"--object-id",
			`:2:${path}`,
			`:1:${path}`,
			`:3:${path}`,
		]);
		// The exit is the count of conflicts, capped at 127; above that, an error.
		if (merged.code < 0 || merged.code > 127) continue;
		const pieces = readMerge(merged.stdout);
		const both = pieces && joinAdditions(pieces, path);
		if (!both) continue;
		joined.push({ path, ...both });
		moves.push(...both.moves);
	}
	if (joined.length === 0) return { settled, moves };

	// What the halted commit added, so only its own citations are rewritten.
	const added =
		moves.length === 0
			? new Map<string, { line: number; text: string }[]>()
			: addedLines(
					(await git(exec, treePath, [
						"-c",
						"core.quotepath=off",
						"diff",
						"-U0",
						"--no-color",
						"--no-ext-diff",
						"REBASE_HEAD^",
						"REBASE_HEAD",
					])) ?? "",
				);
	const addedBy = (file: string) =>
		new Set((added.get(file) ?? []).map(({ text }) => text));

	const written: string[] = [];
	for (const file of joined) {
		const mine = addedBy(file.path);
		const lines = file.lines.map((line, index) => {
			// The landed side's lines are never rewritten: its numbers are its own.
			if (moves.length === 0) return line;
			const bare = line.replace(/\r?\n$/, "");
			if (!file.theirs.has(index) && !mine.has(bare)) return line;
			return recite(line, moves, file.path);
		});
		try {
			writeFileSync(join(top, file.path), lines.join(""));
		} catch {
			continue;
		}
		written.push(file.path);
	}

	// The halted commit's other files, where it cites what moved.
	const cited: string[] = [];
	if (moves.length > 0) {
		for (const [file, lines] of added) {
			if (joined.some((one) => one.path === file)) continue;
			const mine = new Set(lines.map(({ text }) => text));
			let content: string;
			try {
				content = readFileSync(join(top, file), "utf8");
			} catch {
				continue;
			}
			if (content.includes("\u0000")) continue;
			const rewritten = linesOf(content)
				.map((line) =>
					mine.has(line.replace(/\r?\n$/, ""))
						? recite(line, moves, file)
						: line,
				)
				.join("");
			if (rewritten === content) continue;
			try {
				writeFileSync(join(top, file), rewritten);
			} catch {
				continue;
			}
			cited.push(file);
		}
	}

	const staged = [...written, ...cited];
	if (staged.length === 0) return { settled, moves: [] };
	const add = await exec("git", [
		"-C",
		treePath,
		"add",
		"--",
		...staged.map((path) => `:(top,literal)${path}`),
	]);
	if (add.code !== 0) return { settled, moves: [] };

	for (const file of joined.filter((one) => written.includes(one.path))) {
		settled.push({
			path: file.path,
			hunks: file.hunks,
			renumbered: file.moves.map((move) => ({
				from: citedAs(move.path, move.prefix, move.from),
				to: citedAs(move.path, move.prefix, move.to),
			})),
			cited: file.moves.length > 0 ? cited : [],
		});
	}
	return {
		settled,
		moves: moves.filter((move) => written.includes(move.path)),
	};
}
