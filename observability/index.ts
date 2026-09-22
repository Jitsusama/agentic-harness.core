/**
 * Observability: first-class run telemetry for subagent and
 * council fan-outs.
 *
 * The parent session records one {@link RunRecord} per
 * subagent as it finishes, into a SQLite table kept in its
 * own database file. Rows are queryable on demand, roll up
 * into periodic per-model and per-persona summaries before
 * they age out, and drive a compact status-line figure.
 *
 * The ledger beside it covers the other side of the bill: the
 * main loop's own turns, addressed by content so a total can
 * be trusted.
 *
 * Reading a harness's log format into those turns is that
 * harness's own business and lives in its package.
 */

export {
	type CostDimension,
	type CostSlice,
	type LedgerTotal,
	openTurnStore,
	type RecordOutcome,
	type RepeatedCall,
	type SessionRecord,
	type ToolCallRecord,
	type TurnKind,
	type TurnRecord,
	type TurnStore,
} from "./ledger/index.js";

export {
	type RunRecorder,
	type RunRecordInput,
	recordRunEverywhere,
	registerRunRecorder,
	runRecordFrom,
} from "./recorder.js";
export { openRunStore, type RunQuery, type RunStore } from "./store.js";
export type {
	RunCost,
	RunRecord,
	RunRollup,
	RunSummary,
	RunTokens,
	VerifyOutcome,
} from "./types.js";
