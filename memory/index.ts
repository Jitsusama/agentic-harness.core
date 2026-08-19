/**
 * Public API for the `memory` domain: durable, scoped facts with
 * lifecycle-based retention, not age-based eviction.
 *
 * Deliberately not exported here: resolving which scope currently
 * applies (see scope.ts) and presentation (formatting facts for a
 * particular host's reply shape is the adapter's job).
 */

export { memoryDbPath } from "./paths.js";
export { serializeScope } from "./scope.js";
export { openMemoryStore } from "./store.js";
export type {
	Fact,
	FactStatus,
	MemoryStore,
	RecallQuery,
	RetainInput,
	Scope,
} from "./types.js";
