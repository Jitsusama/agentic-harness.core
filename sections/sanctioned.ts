/**
 * The closed set of sanctioned section headings, one set per
 * artifact. Each entry is the exact heading string the body must
 * use: the hashes, the emoji and the name together. Beside the PR's
 * set sits its shape: what each of those sections may hold.
 *
 * These constants are the single source the gate enforces, but
 * the skills are the single source of truth for what the
 * conventions are.
 */

import type { BodyShape } from "./shape.js";

/**
 * The PR body's four required sections, in order: the four questions a
 * reader who will not open the diff asks, in the order they ask them.
 * What is this, why was it needed, what did you do and why this way,
 * and why should I believe it.
 */
export const PR_SECTIONS = [
	"### 💡 TL;DR",
	"### 🧩 Problem",
	"### 🔧 Solution",
	"### 🔬 Validation",
] as const;

/**
 * What each PR section may hold, from the github-pr-format skill. The
 * TL;DR is an eight-second read: 40 words at the 238 words a minute an
 * adult reads non-fiction. The other ceilings are generous on purpose,
 * well above what a good description needs, so that a complex change is
 * never squeezed into vagueness while an inventory still cannot pass.
 */
export const PR_SHAPE: BodyShape = {
	headingFirst: true,
	sentenceWords: 40,
	sections: {
		[PR_SECTIONS[0]]: {
			words: 40,
			sentences: 2,
			codeSpans: 0,
			bullets: 0,
			links: 0,
		},
		[PR_SECTIONS[1]]: { words: 180, codeSpans: 3, bullets: 0 },
		[PR_SECTIONS[2]]: {
			words: 300,
			codeSpans: 8,
			bullets: 7,
			noArtifactLists: true,
		},
		[PR_SECTIONS[3]]: { words: 180, bullets: 7 },
	},
};

/** The issue body's three required sections, in order. */
export const ISSUE_SECTIONS = [
	"### 🌐 Situation",
	"### 🎯 Outcome",
	"### ✅ Acceptance",
] as const;
