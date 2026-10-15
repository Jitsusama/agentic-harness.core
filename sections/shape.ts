/**
 * Shape rules for the sections of a body: how long each may be, and
 * what each may hold. The section detector says whether the right
 * headings are there; this says whether what sits under them is
 * something a person can read in the time they have.
 *
 * The limits come from the research behind the github-pr-format
 * skill. A reader takes in about 238 words a minute (Brysbaert,
 * 2019), so a 40-word TL;DR is the eight-second read it promises. A
 * problem told as cause and effect is remembered far better than a
 * list of facts about a topic (Meyer and Freedle, 1984), so the
 * Problem is prose and the Solution may not become an inventory of
 * the files it touched. Every rule is mechanical on purpose: a gate
 * that judges cannot be held to the same answer twice.
 *
 * Detection never rewrites. It names the section, the rule, the limit
 * and what it found, and leaves the repair to the author.
 */

import type { Violation } from "../gate/index.js";

/** What one section may hold. Every limit is a maximum; absent means no limit. */
export interface SectionShape {
	/** Words of prose, not counting code blocks, context lines or the link footer. */
	readonly words?: number;
	/** Sentences of prose. */
	readonly sentences?: number;
	/** Inline code spans. */
	readonly codeSpans?: number;
	/** List items. */
	readonly bullets?: number;
	/** Links, reference or inline, and bare URLs. */
	readonly links?: number;
	/** When true, refuse list items labelled as artifacts ("Docs:", "Tests:"). */
	readonly noArtifactLists?: boolean;
}

/** The shape of a whole body. */
export interface BodyShape {
	/** Rules per section, keyed by the exact heading. */
	readonly sections: Readonly<Record<string, SectionShape>>;
	/** The longest sentence allowed in any section with rules. */
	readonly sentenceWords?: number;
	/** When true, nothing may sit above the first heading. */
	readonly headingFirst?: boolean;
}

/** Which rule a shape violation broke. */
export type ShapeRule =
	| "words"
	| "sentences"
	| "codeSpans"
	| "bullets"
	| "links"
	| "artifactLists"
	| "sentenceWords"
	| "empty"
	| "above";

/** One way a body breaks its shape. */
export interface ShapeViolation extends Violation {
	readonly kind: "shape";
	/** The heading the violation sits under, or "" for the text above the first. */
	readonly section: string;
	readonly rule: ShapeRule;
	/** The maximum the rule allows; 0 for rules that allow nothing. */
	readonly limit: number;
	/** What the section actually holds, in the rule's unit. */
	readonly actual: number;
	/** The opening of the offending sentence or line, where there is one. */
	readonly excerpt?: string;
}

const FENCE = /```[\s\S]*?```/g;
const CODE_SPAN = /`[^`\n]+`/g;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
const VARIATION_SELECTOR = /\uFE0F/g;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;
const LINK = /\[[^\]\n]+\]\[[^\]\n]*\]|\[[^\]\n]+\]\([^)\n]*\)|https?:\/\/\S+/g;
const ABBREVIATION = /\b(e\.g|i\.e|etc|vs|cf)\./gi;
const EXCERPT_WORDS = 10;

/**
 * Labels that make a list item an inventory of what the diff touched
 * rather than a behaviour. Matched only as a label (the item's first
 * words followed by a colon), so a bullet that mentions tests in a
 * sentence is left alone.
 */
const ARTIFACT_LABEL =
	/^\s*(?:[-*+]|\d+\.)\s+(?:\*\*)?(?:docs?|documentation|tests?|testing|files?|dependenc(?:y|ies)|deps|changelog|readme|config(?:uration)?)(?:\*\*)?\s*:/i;

/**
 * Lines that are context rather than prose: the tracking-issue line,
 * a stack note and the reference-link footer. They are allowed in a
 * section but are not what its limits measure.
 */
function isContext(line: string): boolean {
	return (
		/^\s*Part of #\d+/i.test(line) ||
		/^\s*>/.test(line) ||
		/^\s*\[[^\]]+\]:\s+\S/.test(line)
	);
}

/** The text under each heading, with fenced blocks kept out of the heading scan. */
function split(body: string): { heading: string; text: string }[] {
	const masked = body.replace(FENCE, (m) => m.replace(/#/g, " "));
	const lines = body.split("\n");
	const maskedLines = masked.split("\n");
	const out: { heading: string; lines: string[] }[] = [
		{ heading: "", lines: [] },
	];
	for (const [i, line] of lines.entries()) {
		const match = HEADING.exec(maskedLines[i] ?? "");
		if (match) {
			const heading = `${match[1]} ${match[2]}`.replace(VARIATION_SELECTOR, "");
			out.push({ heading, lines: [] });
		} else {
			out.at(-1)?.lines.push(line);
		}
	}
	return out.map((s) => ({ heading: s.heading, text: s.lines.join("\n") }));
}

/** The prose of a section: no context lines, no fenced blocks. */
function proseOf(text: string): string {
	return text
		.replace(FENCE, "")
		.split("\n")
		.filter((line) => !isContext(line))
		.join("\n")
		.trim();
}

/** The words a reader reads, with markdown syntax taken out. */
export function countWords(text: string): number {
	const plain = text
		.replace(FENCE, " ")
		.replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1")
		.replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
		.replace(new RegExp(LIST_ITEM.source, "gm"), "")
		.replace(/[*_`#>]/g, " ");
	return plain.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * The sentences of some prose. A code span is held as one word so a
 * dot inside it never ends a sentence, a common abbreviation keeps
 * its dot, and a paragraph break or a new list item always ends one.
 * A semicolon does not: a chain of clauses joined by semicolons reads
 * as one long sentence, and is measured as one.
 */
export function sentencesOf(text: string): string[] {
	const prose = text
		.replace(FENCE, " ")
		.replace(CODE_SPAN, "CODE")
		.replace(ABBREVIATION, "$1");
	return prose
		.split(/\n\s*\n|\n(?=\s*(?:[-*+]|\d+\.)\s)/)
		.flatMap((chunk) =>
			chunk.split(/(?<=[.!?]["')\]]?)\s+(?=["'([]?[\p{Lu}\p{N}])/u),
		)
		.map((s) => s.replace(/\s+/g, " ").trim())
		.filter((s) => countWords(s) > 0);
}

function excerpt(sentence: string): string {
	const opening = sentence.split(/\s+/).slice(0, EXCERPT_WORDS).join(" ");
	return `${opening}...`;
}

function violation(
	section: string,
	rule: ShapeRule,
	limit: number,
	actual: number,
	quoted?: string,
): ShapeViolation {
	return {
		kind: "shape",
		section,
		rule,
		limit,
		actual,
		found: `${section} ${rule}`,
		...(quoted ? { excerpt: excerpt(quoted) } : {}),
	};
}

/** A limit broken, as a violation, or nothing. */
function over(
	section: string,
	rule: ShapeRule,
	limit: number | undefined,
	actual: number,
): ShapeViolation[] {
	return limit !== undefined && actual > limit
		? [violation(section, rule, limit, actual)]
		: [];
}

/** Every way the body breaks its shape, in reading order. Empty when it keeps it. */
export function detectShapeViolations(
	body: string,
	shape: BodyShape,
): ShapeViolation[] {
	const [above, ...sections] = split(body);
	const found: ShapeViolation[] = [];

	if (shape.headingFirst && sections.length > 0 && above?.text.trim()) {
		const first = above.text.trim().split("\n")[0] ?? "";
		found.push(violation("", "above", 0, countWords(above.text), first));
	}

	for (const { heading, text } of sections) {
		const rules = shape.sections[heading];
		if (!rules) continue;
		const prose = proseOf(text);
		const sentences = sentencesOf(prose);
		const wordCount = countWords(prose);

		if (wordCount === 0) {
			found.push(violation(heading, "empty", 0, 0));
			continue;
		}
		found.push(...over(heading, "words", rules.words, wordCount));
		found.push(
			...over(heading, "sentences", rules.sentences, sentences.length),
		);
		const code = prose.match(CODE_SPAN)?.length ?? 0;
		found.push(...over(heading, "codeSpans", rules.codeSpans, code));
		const lines = prose.split("\n");
		const items = lines.filter((l) => LIST_ITEM.test(l)).length;
		found.push(...over(heading, "bullets", rules.bullets, items));
		const links = prose.match(LINK)?.length ?? 0;
		found.push(...over(heading, "links", rules.links, links));
		if (rules.noArtifactLists) {
			const labelled = lines.filter((l) => ARTIFACT_LABEL.test(l));
			if (labelled.length > 0) {
				found.push(
					violation(heading, "artifactLists", 0, labelled.length, labelled[0]),
				);
			}
		}
		if (shape.sentenceWords !== undefined) {
			for (const sentence of sentences) {
				const n = countWords(sentence);
				if (n > shape.sentenceWords) {
					found.push(
						violation(
							heading,
							"sentenceWords",
							shape.sentenceWords,
							n,
							sentence,
						),
					);
				}
			}
		}
	}
	return found;
}
