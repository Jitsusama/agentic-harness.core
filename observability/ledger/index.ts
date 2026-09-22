/**
 * The ledger: billable turns read back out of session logs.
 *
 * Cost is derived from the logs pi already writes rather than recorded a
 * second time, so there is exactly one writer of the truth and the ledger
 * can be rebuilt from scratch whenever its shape changes.
 */

export { readTurns } from "./scan.js";
export {
	type CostDimension,
	type CostSlice,
	type LedgerTotal,
	openTurnStore,
	type RecordOutcome,
	type TurnStore,
} from "./store.js";
export type {
	LedgerScan,
	ScanCoverage,
	TurnKind,
	TurnRecord,
} from "./types.js";
