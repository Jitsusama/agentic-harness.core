import type { RunCost, RunTokens } from "../types.js";

/** What a turn was billed for. */
export type TurnKind = "assistant" | "compaction";

/**
 * One billable turn read out of a session log.
 *
 * `cost` is null when the entry carried no usage. That is deliberately
 * distinct from zero: a turn whose provider died before reporting cost an
 * unknown amount, and recording it as free understates every total it
 * appears in.
 */
export interface TurnRecord {
	readonly entryId: string;
	readonly sessionId: string;
	/** ISO 8601, as the log wrote it. */
	readonly timestamp: string;
	readonly kind: TurnKind;
	/** Resolved model id, or empty when the entry did not say. */
	readonly model: string;
	readonly tokens: RunTokens;
	/** Null when unmetered. Never coerced to zero. */
	readonly cost: RunCost | null;
	/** Cache writes billed at the one-hour rate, for retention accounting. */
	readonly cacheWrite1h: number;
	/** Compaction only: resident tokens before the cut. */
	readonly droppedBefore: number | null;
	/** Compaction only: the first entry the cut kept, which bounds what it dropped. */
	readonly firstKeptEntryId: string | null;
	/**
	 * Content address of the turn's billable identity. Equal across forked
	 * sessions, which is what lets a corpus-wide total deduplicate the
	 * roughly ten percent of entries that forking copies verbatim.
	 */
	readonly digest: string;
}

/**
 * One tool call, addressed by what it asked rather than what it got
 * back, with no bytes of either kept.
 *
 * The digests are what make repetition visible: a call whose arguments
 * digest to something already asked in the same session asked a
 * question that session's context could already answer. That is waste
 * with no value judgement in it, which is what makes it safe to act on.
 */
export interface ToolCallRecord {
	/** Content address of the call, stable across a forked log. */
	readonly digest: string;
	readonly sessionId: string;
	/** The assistant entry that made the call. */
	readonly entryId: string;
	/** The call's own id, which its result names. */
	readonly callId: string;
	readonly timestamp: string;
	readonly name: string;
	/** Digest of the arguments, never the arguments. */
	readonly argsDigest: string;
	/**
	 * What kind of verifier this call ran, if it ran one at all. Classified
	 * from the command text at scan time, before that text is digested
	 * away, so this is the one place any of it survives, and only as a
	 * category. A chained gate running more than one kind is `verify`
	 * rather than a pick of one, since one exit code cannot support the
	 * precision of naming a single kind.
	 */
	readonly verifierKind: VerifierKind | null;
	/** The file the call declared, when it declared one. */
	readonly path: string | null;
	/** Characters the result came back with, or null if it never came. */
	readonly resultChars: number | null;
	/** Digest of the result text, or null if it never came. */
	readonly resultDigest: string | null;
	/** Whether the result came back an error. Null when it never came. */
	readonly isError: boolean | null;
}

/**
 * What kind of verifier a call ran. `verify` names a chained gate that
 * ran more than one kind under a single exit code, which is a category
 * of its own rather than a guess at which one kind mattered.
 */
export type VerifierKind = "test" | "build" | "typecheck" | "lint" | "verify";

/** How a kind of verifier fared across every call classified as it. */
export interface VerifierOutcome {
	readonly kind: VerifierKind;
	readonly passed: number;
	readonly failed: number;
	/** Calls whose result never arrived, so pass or fail is unknown. */
	readonly unknown: number;
}

/**
 * How real compactions compare against the payback test, replayed over
 * turns already in the ledger rather than watched live. `evaluable`
 * excludes a compaction with no turn after it (nothing to measure
 * retention from) or whose model has no derivable rate yet.
 */
export interface PaybackReplay {
	readonly compactions: number;
	readonly evaluable: number;
	/** The test would also have fired. */
	readonly agreed: number;
	/** The test would have declined what actually happened. */
	readonly disagreed: number;
}

/**
 * A tool call a compaction dropped from context, and where it happened.
 *
 * Recorded at the compaction rather than guessed at later, because the
 * boundary a compaction drew is known precisely then and only then: the
 * entry it names as first kept is a fact about that one event, not
 * something a later query could reconstruct from the calls alone.
 */
export interface DroppedCallRecord {
	/** The call that was dropped, addressing the same row in tool_calls. */
	readonly callDigest: string;
	readonly sessionId: string;
	/** The compaction entry that dropped it. */
	readonly droppedAtEntryId: string;
	readonly droppedAtTimestamp: string;
}

/**
 * A dropped call that was asked again afterward: the earlier answer was
 * discarded and the same question was put a second time. No claim about
 * whether the second asking was necessary, only that it happened.
 */
export interface Regret {
	readonly name: string;
	readonly argsDigest: string;
	readonly sessionId: string;
	readonly droppedAtTimestamp: string;
	readonly reAskedAtTimestamp: string;
	readonly resultChars: number | null;
}

/**
 * Arguments asked more than once inside one session, and what the
 * repeats weighed.
 */
export interface RepeatedCall {
	readonly argsDigest: string;
	readonly name: string;
	/** How many times these arguments were asked. */
	readonly asked: number;
	/** How many of those were repeats, so one less than asked. */
	readonly repeated: number;
	/** Characters the repeats re-admitted to the context. */
	readonly repeatedChars: number;
}

/**
 * What a session log says about itself.
 *
 * Every field but the id may be absent, and absent is kept rather than
 * guessed: attributing spend to a repo or a quest the log never named
 * would charge work that did not incur it.
 */
export interface SessionRecord {
	readonly sessionId: string;
	/** The working directory the log named, if it named one. */
	readonly cwd: string | null;
	/** The repo that directory belongs to, derived from it. */
	readonly repo: string | null;
	/** The quest the session was working under, if any. */
	readonly quest: string | null;
	/** Timestamp of the earliest billed turn. */
	readonly firstSeen: string | null;
	/** Timestamp of the latest billed turn. */
	readonly lastSeen: string | null;
}
