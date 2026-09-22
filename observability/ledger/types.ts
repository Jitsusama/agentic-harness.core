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
