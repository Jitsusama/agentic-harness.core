/**
 * Wording rules for a section: the words a busy reader misreads, as
 * opposed to how many words there are. Length is shape.ts's concern;
 * this is about what a sentence leads the reader to believe.
 *
 * Each rule answers a finding about readers, and each was tuned on PR
 * descriptions written by agents until it flagged what it meant to and
 * little else:
 *
 * - A bare "all", "every" or "most" in the TL;DR. Readers accept a
 *   generalisation on thin evidence and then read it as meaning nearly
 *   every case (Cimpian, Brandone and Gelman, 2010), and language
 *   models broaden claims when they compress them (Peters and
 *   Chin-Yee, 2025). The TL;DR is what most readers read alone, so its
 *   scope has to be a count or a named set.
 * - A TL;DR that opens with "This PR", or tells the history, or leans
 *   on bold. The opening words are what a scanning reader takes in.
 * - A Solution with no reason in its prose. Expert readers follow a
 *   chain of cause and effect, and a list without its reasons hides
 *   the thing they would question (O'Reilly and McNamara, 2007).
 * - Solution bullets that all open with the same word, which reads as
 *   one item said several times.
 * - Validation that hedges, assures or says "tests pass" without
 *   naming the tests. Vague hedges cost trust unpredictably where
 *   specific limits do not (Gustafson and Rice, 2020), and assurance
 *   raises a reader's confidence without raising their accuracy.
 * - Anywhere: a pointer at a conversation the reader missed ("as
 *   discussed", "option B"), which overhearers follow worse than the
 *   people who were in it (Schober and Clark, 1989), and selling words
 *   with no number behind them.
 *
 * The lists are deliberately short. A rule that misfires teaches the
 * writer to dodge a word rather than to say something truer, so a
 * pattern that flagged honest sentences was dropped rather than kept.
 */

import { sentencesOf } from "./shape.js";

/** The wording rules a section can be held to. */
export interface SectionWording {
	/** A near-total quantifier needs a count, a named set or an exception. */
	readonly scoped?: boolean;
	/** Open with what changed: no "This PR", no history, no bold. */
	readonly headline?: boolean;
	/** The prose outside any list gives at least one reason. */
	readonly reasoned?: boolean;
	/** No more than two list items open with the same word. */
	readonly distinctItems?: boolean;
	/** No hedges, no assurances and no bare "tests pass". */
	readonly evidenced?: boolean;
	/** No pointers at a conversation the reader missed, and no selling words. */
	readonly plain?: boolean;
}

/** Which wording rule a sentence broke. */
export type WordingRule =
	| "unscoped"
	| "opener"
	| "emphasis"
	| "history"
	| "noReason"
	| "repeatedOpener"
	| "hedge"
	| "assurance"
	| "barePass"
	| "conversation"
	| "selling";

/** One wording problem: the rule, the word that tripped it and where. */
export interface WordingProblem {
	readonly rule: WordingRule;
	/** The word or phrase that broke the rule. */
	readonly word: string;
	/** The sentence or line it sits in, when there is one. */
	readonly sentence?: string;
	/** For a repeated opener, how many items share it. */
	readonly count?: number;
}

const NUMBER_WORD =
	/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|both|either|neither)\b/i;
const EXCEPTION = /\b(except|other than|apart from|but not|besides)\b/i;
// "each" is distributive, and "several" or "none" rarely claim a scope,
// so only the quantifiers readers take as near-total are flagged.
const UNSCOPED = /\b(all|every|most|many|various)\b(?! (?:time|other)\b)/i;
const NOT_A_SCOPE =
	/\b(?:at all|after all|all the way|all or nothing|every time)\b|\band\b[^,.;]*?\ball\b/gi;
const OPENER =
	/^(this (?:pr|pull request|change|commit)|in this (?:pr|change))\b/i;
const HISTORY = /\b(initially|originally|at first|we tried|iteration)\b/i;
const REASON =
	/\b(because|so that|so|since|instead of|rather than|which means|otherwise|unless)\b/i;
const HEDGE =
	/\b(should (?:work|be fine|be safe|hold)|likely|probably|seems?|appears? to|hopefully|presumably)\b/i;
const ASSURANCE =
	/\b(thoroughly|fully tested|well[- ]tested|battle[- ]tested|robust(?:ly)?|comprehensive(?:ly)?|exhaustive(?:ly)?)\b/i;
const BARE_PASS = /\b(?:all|the) (?:tests|checks)(?: all)? pass(?:es)?\b/i;
const CONVERSATION =
	/\b(as discussed|as agreed|as planned|per the plan|option [A-D]|approach [0-9]|phase [0-9]|(?:first|second|third) attempt)\b/i;
const SELLING =
	/\b(seamless(?:ly)?|significantly|dramatically|greatly|massively)\b/i;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;
const CODE = /`[^`\n]+`|\bCODE\b/;
const SAME_OPENER_LIMIT = 2;

/** True when a sentence already says how much: a number, code, a count word or an exception. */
function scopedAlready(sentence: string): boolean {
	return (
		/\d/.test(sentence) ||
		CODE.test(sentence) ||
		NUMBER_WORD.test(sentence) ||
		EXCEPTION.test(sentence)
	);
}

const matched = (pattern: RegExp, text: string): string =>
	pattern.exec(text)?.[1] ?? pattern.exec(text)?.[0] ?? "";

/** Lines of prose that are not list items. */
function proseLines(prose: string): string[] {
	return prose.split("\n").filter((l) => l.trim() && !LIST_ITEM.test(l));
}

/**
 * Every wording problem in one section's prose, in reading order. The
 * prose is the section with context lines and fenced code already
 * taken out.
 */
export function wordingProblems(
	prose: string,
	rules: SectionWording,
): WordingProblem[] {
	const found: WordingProblem[] = [];
	const sentences = sentencesOf(prose);

	if (rules.scoped) {
		for (const sentence of sentences) {
			const bare = sentence.replace(NOT_A_SCOPE, " ");
			if (UNSCOPED.test(bare) && !scopedAlready(sentence)) {
				found.push({
					rule: "unscoped",
					word: matched(UNSCOPED, bare),
					sentence,
				});
			}
		}
	}

	if (rules.headline) {
		const first = proseLines(prose)[0]?.trim() ?? "";
		if (OPENER.test(first)) {
			found.push({
				rule: "opener",
				word: matched(OPENER, first),
				sentence: first,
			});
		}
		if (/\*\*|__/.test(prose)) found.push({ rule: "emphasis", word: "**" });
		if (HISTORY.test(prose)) {
			found.push({ rule: "history", word: matched(HISTORY, prose) });
		}
	}

	if (rules.reasoned && !REASON.test(proseLines(prose).join(" "))) {
		found.push({ rule: "noReason", word: "" });
	}

	if (rules.distinctItems) {
		const counts = new Map<string, number>();
		for (const line of prose.split("\n")) {
			if (!LIST_ITEM.test(line)) continue;
			const word = line
				.replace(LIST_ITEM, "")
				.replace(/[*_`]/g, "")
				.split(/\s+/)[0]
				?.toLowerCase();
			if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
		}
		for (const [word, count] of counts) {
			if (count > SAME_OPENER_LIMIT) {
				found.push({ rule: "repeatedOpener", word, count });
			}
		}
	}

	if (rules.evidenced) {
		for (const sentence of sentences) {
			if (HEDGE.test(sentence)) {
				found.push({ rule: "hedge", word: matched(HEDGE, sentence), sentence });
			}
			if (ASSURANCE.test(sentence)) {
				found.push({
					rule: "assurance",
					word: matched(ASSURANCE, sentence),
					sentence,
				});
			}
			if (
				BARE_PASS.test(sentence) &&
				!/\d/.test(sentence) &&
				!CODE.test(sentence)
			) {
				found.push({
					rule: "barePass",
					word: matched(BARE_PASS, sentence),
					sentence,
				});
			}
		}
	}

	if (rules.plain) {
		for (const sentence of sentences) {
			if (CONVERSATION.test(sentence)) {
				found.push({
					rule: "conversation",
					word: matched(CONVERSATION, sentence),
					sentence,
				});
			}
			if (SELLING.test(sentence) && !/\d/.test(sentence)) {
				found.push({
					rule: "selling",
					word: matched(SELLING, sentence),
					sentence,
				});
			}
		}
	}
	return found;
}
