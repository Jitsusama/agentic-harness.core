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
 * What a scan saw, so any aggregate built on it can state its own
 * coverage. An aggregate that cannot say what it missed is not evidence.
 */
export interface ScanCoverage {
	/** Lines offered to the scan. */
	readonly lines: number;
	/** Lines that parsed as JSON. */
	readonly parsed: number;
	/** Lines that did not, counted rather than thrown. */
	readonly unparseable: number;
	/** Turns carrying a cost. */
	readonly billable: number;
	/** Turns that should have carried a cost and did not. */
	readonly unmetered: number;
}

/** The turns one session log yielded, and what reading it missed. */
export interface LedgerScan {
	readonly turns: TurnRecord[];
	readonly coverage: ScanCoverage;
}
