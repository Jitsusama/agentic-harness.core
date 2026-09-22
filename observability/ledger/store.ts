import { type Db, openDb } from "../../internal/sqlite/db.js";
import type { TurnRecord } from "./types.js";

/** What a dimension's slice of spend came to. */
export interface CostSlice {
	readonly key: string;
	readonly cost: number;
	readonly turns: number;
}

/** Everything the ledger holds, with its own blind spots stated. */
export interface LedgerTotal {
	readonly cost: number;
	readonly turns: number;
	/** Turns held with no cost, so a total can say what it is missing. */
	readonly unmetered: number;
	readonly cacheWriteTokens: number;
	/** Of those, the ones billed at the one-hour rate. */
	readonly cacheWrite1hTokens: number;
}

/** How many turns a write added, and how many it had already seen. */
export interface RecordOutcome {
	readonly inserted: number;
	readonly duplicates: number;
}

/** What a total or a slice may be narrowed to. */
export type CostDimension = "model" | "session" | "kind" | "day";

/** A content-addressed store of billable turns. */
export interface TurnStore {
	recordTurns(turns: readonly TurnRecord[]): Promise<RecordOutcome>;
	total(): Promise<LedgerTotal>;
	costBy(dimension: CostDimension): Promise<CostSlice[]>;
	close(): Promise<void>;
}

/**
 * `digest` is the primary key rather than the session and entry pair,
 * which is what makes recording idempotent. `sightings` keeps the fact
 * that several logs held the same turn, so nothing is hidden by
 * deduplicating it: the turn is billed once and known to have been seen
 * more than once.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS turns (
	digest TEXT PRIMARY KEY,
	entry_id TEXT NOT NULL,
	session_id TEXT NOT NULL,
	timestamp TEXT NOT NULL,
	kind TEXT NOT NULL,
	model TEXT NOT NULL,
	tokens_input INTEGER NOT NULL,
	tokens_output INTEGER NOT NULL,
	tokens_cache_read INTEGER NOT NULL,
	tokens_cache_write INTEGER NOT NULL,
	tokens_total INTEGER NOT NULL,
	cache_write_1h INTEGER NOT NULL,
	cost_input REAL,
	cost_output REAL,
	cost_cache_read REAL,
	cost_cache_write REAL,
	cost_total REAL,
	dropped_before INTEGER,
	first_kept_entry_id TEXT
);
CREATE INDEX IF NOT EXISTS turns_timestamp ON turns (timestamp);
CREATE INDEX IF NOT EXISTS turns_session ON turns (session_id);
CREATE TABLE IF NOT EXISTS sightings (
	digest TEXT NOT NULL,
	session_id TEXT NOT NULL,
	PRIMARY KEY (digest, session_id)
);
`;

/** Bound variables per probe, well inside SQLite's default ceiling. */
const PROBE_CHUNK = 500;

const GROUP_BY: Record<CostDimension, string> = {
	model: "model",
	session: "session_id",
	kind: "kind",
	day: "substr(timestamp, 1, 10)",
};

/**
 * Open (creating if needed) a turn ledger at the given path. Safe to
 * point at the same file as the run store: the tables are disjoint and
 * WAL keeps readers clear of the single writer.
 */
export async function openTurnStore(dbPath: string): Promise<TurnStore> {
	const db = await openDb(dbPath);
	await db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
	await db.exec(SCHEMA);
	return new SqliteTurnStore(db);
}

class SqliteTurnStore implements TurnStore {
	constructor(private readonly db: Db) {}

	async recordTurns(turns: readonly TurnRecord[]): Promise<RecordOutcome> {
		// Collapse the batch against itself first, then ask the table once
		// which of the survivors it already holds. Counting rows per insert
		// instead would make a corpus pass quadratic: 40,000 turns is 1.6
		// billion scanned rows, which does not finish.
		const fresh = new Map<string, TurnRecord>();
		for (const t of turns) if (!fresh.has(t.digest)) fresh.set(t.digest, t);
		const known = await this.known([...fresh.keys()]);

		// One transaction per batch rather than one per row. Each row is
		// otherwise its own durable commit, which is disk-sync bound: a
		// first pass over the corpus took 13 minutes on that shape.
		await this.db.exec("BEGIN");
		try {
			const inserted = await this.writeAll(fresh, known);
			await this.db.exec("COMMIT");
			return { inserted, duplicates: turns.length - inserted };
		} catch (error) {
			await this.db.exec("ROLLBACK");
			throw error;
		}
	}

	private async writeAll(
		fresh: ReadonlyMap<string, TurnRecord>,
		known: ReadonlySet<string>,
	): Promise<number> {
		let inserted = 0;
		for (const t of fresh.values()) {
			if (known.has(t.digest)) {
				// Seen before, so not billed again, but the sighting is still
				// recorded: deduplicating must not hide that it happened.
				await this.sight(t);
				continue;
			}
			inserted += 1;
			await this.db.run(
				`INSERT OR IGNORE INTO turns (
					digest, entry_id, session_id, timestamp, kind, model,
					tokens_input, tokens_output, tokens_cache_read,
					tokens_cache_write, tokens_total, cache_write_1h,
					cost_input, cost_output, cost_cache_read, cost_cache_write,
					cost_total, dropped_before, first_kept_entry_id
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					t.digest,
					t.entryId,
					t.sessionId,
					t.timestamp,
					t.kind,
					t.model,
					t.tokens.input,
					t.tokens.output,
					t.tokens.cacheRead,
					t.tokens.cacheWrite,
					t.tokens.total,
					t.cacheWrite1h,
					t.cost?.input ?? null,
					t.cost?.output ?? null,
					t.cost?.cacheRead ?? null,
					t.cost?.cacheWrite ?? null,
					t.cost?.total ?? null,
					t.droppedBefore,
					t.firstKeptEntryId,
				],
			);
			await this.sight(t);
		}
		return inserted;
	}

	async total(): Promise<LedgerTotal> {
		const rows = await this.db.all<{
			cost: number | null;
			turns: number;
			unmetered: number;
			cache_write: number | null;
			cache_write_1h: number | null;
		}>(
			`SELECT
				SUM(cost_total) AS cost,
				COUNT(*) AS turns,
				SUM(CASE WHEN cost_total IS NULL THEN 1 ELSE 0 END) AS unmetered,
				SUM(tokens_cache_write) AS cache_write,
				SUM(cache_write_1h) AS cache_write_1h
			FROM turns`,
		);
		const row = rows[0];
		return {
			cost: row?.cost ?? 0,
			turns: row?.turns ?? 0,
			unmetered: row?.unmetered ?? 0,
			cacheWriteTokens: row?.cache_write ?? 0,
			cacheWrite1hTokens: row?.cache_write_1h ?? 0,
		};
	}

	async costBy(dimension: CostDimension): Promise<CostSlice[]> {
		const column = GROUP_BY[dimension];
		const rows = await this.db.all<{
			key: string;
			cost: number | null;
			turns: number;
		}>(
			`SELECT ${column} AS key, SUM(cost_total) AS cost, COUNT(*) AS turns
			FROM turns GROUP BY ${column} ORDER BY cost DESC`,
		);
		return rows.map((r) => ({
			key: r.key,
			cost: r.cost ?? 0,
			turns: r.turns,
		}));
	}

	async close(): Promise<void> {
		await this.db.close();
	}

	private async sight(t: TurnRecord): Promise<void> {
		await this.db.run(
			"INSERT OR IGNORE INTO sightings (digest, session_id) VALUES (?, ?)",
			[t.digest, t.sessionId],
		);
	}

	/** Which of these addresses the table already holds. */
	private async known(digests: readonly string[]): Promise<Set<string>> {
		const found = new Set<string>();
		for (let i = 0; i < digests.length; i += PROBE_CHUNK) {
			const chunk = digests.slice(i, i + PROBE_CHUNK);
			const holes = chunk.map(() => "?").join(",");
			const rows = await this.db.all<{ digest: string }>(
				`SELECT digest FROM turns WHERE digest IN (${holes})`,
				chunk,
			);
			for (const r of rows) found.add(r.digest);
		}
		return found;
	}
}
