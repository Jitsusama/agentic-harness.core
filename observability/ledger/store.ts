import { type Db, openDb } from "../../internal/sqlite/db.js";
import type {
	DroppedCallRecord,
	Regret,
	RepeatedCall,
	SessionRecord,
	ToolCallRecord,
	TurnRecord,
} from "./types.js";

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
export type CostDimension =
	| "model"
	| "session"
	| "kind"
	| "day"
	| "repo"
	| "quest";

/** A content-addressed store of billable turns. */
export interface TurnStore {
	recordTurns(turns: readonly TurnRecord[]): Promise<RecordOutcome>;
	recordSession(session: SessionRecord): Promise<void>;
	recordCalls(calls: readonly ToolCallRecord[]): Promise<RecordOutcome>;
	queryCalls(): Promise<ToolCallRecord[]>;
	/** Arguments asked more than once in one session, heaviest first. */
	repeatedCalls(): Promise<RepeatedCall[]>;
	recordDropped(dropped: readonly DroppedCallRecord[]): Promise<RecordOutcome>;
	queryDropped(): Promise<DroppedCallRecord[]>;
	/** Dropped calls asked again after the drop, earliest re-ask first. */
	regret(): Promise<Regret[]>;
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
CREATE TABLE IF NOT EXISTS tool_calls (
	digest TEXT PRIMARY KEY,
	session_id TEXT NOT NULL,
	entry_id TEXT NOT NULL,
	call_id TEXT NOT NULL,
	timestamp TEXT NOT NULL,
	name TEXT NOT NULL,
	args_digest TEXT NOT NULL,
	path TEXT,
	result_chars INTEGER,
	result_digest TEXT,
	is_error INTEGER
);
CREATE INDEX IF NOT EXISTS tool_calls_args ON tool_calls (session_id, args_digest);
CREATE INDEX IF NOT EXISTS tool_calls_path ON tool_calls (path);
CREATE TABLE IF NOT EXISTS dropped_calls (
	digest TEXT PRIMARY KEY,
	session_id TEXT NOT NULL,
	dropped_at_entry_id TEXT NOT NULL,
	dropped_at_timestamp TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
	session_id TEXT PRIMARY KEY,
	cwd TEXT,
	repo TEXT,
	quest TEXT,
	first_seen TEXT,
	last_seen TEXT
);
`;

/** Bound variables per probe, well inside SQLite's default ceiling. */
const PROBE_CHUNK = 500;

const GROUP_BY: Record<CostDimension, string> = {
	model: "turns.model",
	session: "turns.session_id",
	kind: "turns.kind",
	day: "substr(turns.timestamp, 1, 10)",
	// A left join, and coalesced to the empty string, so spend whose
	// session named no repo or quest stays a visible slice. An inner join
	// would drop it, and every share would then be a fraction of a total
	// that quietly excluded most of the money.
	repo: "COALESCE(sessions.repo, '')",
	quest: "COALESCE(sessions.quest, '')",
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

	/**
	 * Replace what is known about a session. The row is a current fact
	 * rather than an append-only history: a re-index of a log that moved
	 * quest should report where it ended up.
	 */
	async recordCalls(calls: readonly ToolCallRecord[]): Promise<RecordOutcome> {
		const fresh = new Map<string, ToolCallRecord>();
		for (const c of calls) if (!fresh.has(c.digest)) fresh.set(c.digest, c);
		const known = await this.knownCalls([...fresh.keys()]);

		await this.db.exec("BEGIN");
		try {
			let inserted = 0;
			for (const c of fresh.values()) {
				if (known.has(c.digest)) continue;
				inserted += 1;
				await this.db.run(
					`INSERT INTO tool_calls (
						digest, session_id, entry_id, call_id, timestamp, name,
						args_digest, path, result_chars, result_digest, is_error
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						c.digest,
						c.sessionId,
						c.entryId,
						c.callId,
						c.timestamp,
						c.name,
						c.argsDigest,
						c.path,
						c.resultChars,
						c.resultDigest,
						// Null is not false: a call whose result never arrived
						// did not come back succeeding.
						c.isError === null ? null : c.isError ? 1 : 0,
					],
				);
			}
			await this.db.exec("COMMIT");
			return { inserted, duplicates: calls.length - inserted };
		} catch (error) {
			await this.db.exec("ROLLBACK");
			throw error;
		}
	}

	async queryCalls(): Promise<ToolCallRecord[]> {
		const rows = await this.db.all<CallRow>(
			"SELECT * FROM tool_calls ORDER BY timestamp ASC",
		);
		return rows.map((row) => ({
			digest: row.digest,
			sessionId: row.session_id,
			entryId: row.entry_id,
			callId: row.call_id,
			timestamp: row.timestamp,
			name: row.name,
			argsDigest: row.args_digest,
			path: row.path,
			resultChars: row.result_chars,
			resultDigest: row.result_digest,
			isError: row.is_error === null ? null : row.is_error === 1,
		}));
	}

	/**
	 * Arguments asked more than once inside one session.
	 *
	 * Grouped by session as well as by arguments, because a second
	 * session has none of the first one's context: asking again is the
	 * only way it could know. Only repetition within a session is a
	 * question whose answer was already there.
	 */
	async repeatedCalls(): Promise<RepeatedCall[]> {
		const rows = await this.db.all<{
			args_digest: string;
			name: string;
			asked: number;
			repeated_chars: number | null;
		}>(
			`SELECT args_digest, name, COUNT(*) AS asked,
				SUM(COALESCE(result_chars, 0))
					- MAX(COALESCE(result_chars, 0)) AS repeated_chars
			FROM tool_calls
			GROUP BY session_id, args_digest
			HAVING asked > 1
			ORDER BY repeated_chars DESC`,
		);
		return rows.map((row) => ({
			argsDigest: row.args_digest,
			name: row.name,
			asked: row.asked,
			repeated: row.asked - 1,
			repeatedChars: row.repeated_chars ?? 0,
		}));
	}

	async recordDropped(
		dropped: readonly DroppedCallRecord[],
	): Promise<RecordOutcome> {
		const fresh = new Map<string, DroppedCallRecord>();
		for (const d of dropped) {
			if (!fresh.has(d.callDigest)) fresh.set(d.callDigest, d);
		}
		const known = await this.alreadyHeld("dropped_calls", [...fresh.keys()]);

		await this.db.exec("BEGIN");
		try {
			let inserted = 0;
			for (const d of fresh.values()) {
				if (known.has(d.callDigest)) continue;
				inserted += 1;
				await this.db.run(
					`INSERT INTO dropped_calls (
						digest, session_id, dropped_at_entry_id, dropped_at_timestamp
					) VALUES (?, ?, ?, ?)`,
					[d.callDigest, d.sessionId, d.droppedAtEntryId, d.droppedAtTimestamp],
				);
			}
			await this.db.exec("COMMIT");
			return { inserted, duplicates: dropped.length - inserted };
		} catch (error) {
			await this.db.exec("ROLLBACK");
			throw error;
		}
	}

	async queryDropped(): Promise<DroppedCallRecord[]> {
		const rows = await this.db.all<{
			digest: string;
			session_id: string;
			dropped_at_entry_id: string;
			dropped_at_timestamp: string;
		}>("SELECT * FROM dropped_calls ORDER BY dropped_at_timestamp ASC");
		return rows.map((row) => ({
			callDigest: row.digest,
			sessionId: row.session_id,
			droppedAtEntryId: row.dropped_at_entry_id,
			droppedAtTimestamp: row.dropped_at_timestamp,
		}));
	}

	/**
	 * Dropped calls asked again after the drop.
	 *
	 * Joined on the dropped call's own arguments and session, restricted
	 * to a later call that came after the drop rather than before it: a
	 * repeat that predates the drop is an ordinary repeat, not a case of
	 * the context having to re-fetch what it lost.
	 */
	async regret(): Promise<Regret[]> {
		const rows = await this.db.all<{
			name: string;
			args_digest: string;
			session_id: string;
			dropped_at_timestamp: string;
			re_asked_at_timestamp: string;
			result_chars: number | null;
		}>(
			`SELECT dropped_calls.session_id AS session_id,
				dropped.name AS name,
				dropped.args_digest AS args_digest,
				dropped_calls.dropped_at_timestamp AS dropped_at_timestamp,
				re_ask.timestamp AS re_asked_at_timestamp,
				re_ask.result_chars AS result_chars
			FROM dropped_calls
			JOIN tool_calls AS dropped
				ON dropped.digest = dropped_calls.digest
			JOIN tool_calls AS re_ask
				ON re_ask.session_id = dropped_calls.session_id
				AND re_ask.args_digest = dropped.args_digest
				AND re_ask.timestamp > dropped_calls.dropped_at_timestamp
			ORDER BY re_ask.timestamp ASC`,
		);
		return rows.map((row) => ({
			name: row.name,
			argsDigest: row.args_digest,
			sessionId: row.session_id,
			droppedAtTimestamp: row.dropped_at_timestamp,
			reAskedAtTimestamp: row.re_asked_at_timestamp,
			resultChars: row.result_chars,
		}));
	}

	async recordSession(session: SessionRecord): Promise<void> {
		await this.db.run(
			`INSERT INTO sessions (
				session_id, cwd, repo, quest, first_seen, last_seen
			) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(session_id) DO UPDATE SET
				cwd = excluded.cwd,
				repo = excluded.repo,
				quest = excluded.quest,
				first_seen = MIN(first_seen, excluded.first_seen),
				last_seen = MAX(last_seen, excluded.last_seen)`,
			[
				session.sessionId,
				session.cwd,
				session.repo,
				session.quest,
				session.firstSeen,
				session.lastSeen,
			],
		);
	}

	async costBy(dimension: CostDimension): Promise<CostSlice[]> {
		const column = GROUP_BY[dimension];
		const rows = await this.db.all<{
			key: string;
			cost: number | null;
			turns: number;
		}>(
			`SELECT ${column} AS key, SUM(cost_total) AS cost, COUNT(*) AS turns
			FROM turns
			LEFT JOIN sessions ON sessions.session_id = turns.session_id
			GROUP BY ${column} ORDER BY cost DESC`,
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

	/** Which of these call addresses the table already holds. */
	private async knownCalls(digests: readonly string[]): Promise<Set<string>> {
		return this.alreadyHeld("tool_calls", digests);
	}

	/** Which of these addresses the table already holds. */
	private async known(digests: readonly string[]): Promise<Set<string>> {
		return this.alreadyHeld("turns", digests);
	}

	/**
	 * Which of these digests a table already holds, probed in chunks so a
	 * corpus-sized batch stays inside SQLite's bound-variable ceiling.
	 */
	private async alreadyHeld(
		table: "turns" | "tool_calls" | "dropped_calls",
		digests: readonly string[],
	): Promise<Set<string>> {
		const found = new Set<string>();
		for (let i = 0; i < digests.length; i += PROBE_CHUNK) {
			const chunk = digests.slice(i, i + PROBE_CHUNK);
			const holes = chunk.map(() => "?").join(",");
			// The table name is a literal from a two-member union, not
			// caller input, so it cannot carry anything but itself.
			const rows = await this.db.all<{ digest: string }>(
				`SELECT digest FROM ${table} WHERE digest IN (${holes})`,
				chunk,
			);
			for (const r of rows) found.add(r.digest);
		}
		return found;
	}
}

interface CallRow {
	digest: string;
	session_id: string;
	entry_id: string;
	call_id: string;
	timestamp: string;
	name: string;
	args_digest: string;
	path: string | null;
	result_chars: number | null;
	result_digest: string | null;
	is_error: number | null;
}
