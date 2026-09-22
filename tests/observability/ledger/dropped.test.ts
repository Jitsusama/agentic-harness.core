import { describe, expect, it } from "vitest";
import {
	type DroppedCallRecord,
	openTurnStore,
	type ToolCallRecord,
} from "../../../observability/ledger/index.js";

function call(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
	return {
		digest: "c1",
		sessionId: "s1",
		entryId: "a1",
		callId: "t1",
		timestamp: "2026-09-21T17:50:00.000Z",
		name: "read",
		argsDigest: "read-x",
		path: "/x",
		resultChars: 1000,
		resultDigest: "res-1",
		isError: false,
		...overrides,
	};
}

function dropped(
	overrides: Partial<DroppedCallRecord> = {},
): DroppedCallRecord {
	return {
		callDigest: "c1",
		sessionId: "s1",
		droppedAtEntryId: "comp1",
		droppedAtTimestamp: "2026-09-21T17:55:00.000Z",
		...overrides,
	};
}

describe("dropped calls and regret", () => {
	it("round-trips a dropped call", async () => {
		const store = await openTurnStore(":memory:");
		await store.recordCalls([call()]);
		await store.recordDropped([dropped()]);

		expect(await store.queryDropped()).toEqual([dropped()]);
		await store.close();
	});

	it("bills a drop once however many forked logs repeat it", async () => {
		const store = await openTurnStore(":memory:");
		await store.recordCalls([call()]);
		const first = await store.recordDropped([dropped()]);
		const again = await store.recordDropped([dropped()]);

		expect(first.inserted).toBe(1);
		expect(again.inserted).toBe(0);
		expect(await store.queryDropped()).toHaveLength(1);
		await store.close();
	});

	it("counts a dropped call asked again afterward as regret", async () => {
		const store = await openTurnStore(":memory:");
		await store.recordCalls([
			call({ digest: "c1", timestamp: "2026-09-21T17:50:00.000Z" }),
			call({
				digest: "c2",
				callId: "t2",
				timestamp: "2026-09-21T18:05:00.000Z",
				resultChars: 900,
			}),
		]);
		await store.recordDropped([
			dropped({
				callDigest: "c1",
				droppedAtTimestamp: "2026-09-21T17:55:00.000Z",
			}),
		]);

		const regret = await store.regret();
		expect(regret).toHaveLength(1);
		expect(regret[0]).toMatchObject({
			name: "read",
			argsDigest: "read-x",
			sessionId: "s1",
			resultChars: 900,
		});
		await store.close();
	});

	it("does not count a dropped call as regret unless it was asked again after the drop", async () => {
		const store = await openTurnStore(":memory:");
		await store.recordCalls([call()]);
		await store.recordDropped([dropped()]);

		expect(await store.regret()).toEqual([]);
		await store.close();
	});

	it("does not count a call before the drop as regret for it", async () => {
		// A repeat that happened before the drop is an ordinary repeat,
		// not a case of the context having to re-fetch what it lost.
		const store = await openTurnStore(":memory:");
		await store.recordCalls([
			call({ digest: "c1", timestamp: "2026-09-21T17:40:00.000Z" }),
			call({
				digest: "c2",
				callId: "t2",
				timestamp: "2026-09-21T17:45:00.000Z",
			}),
		]);
		await store.recordDropped([
			dropped({
				callDigest: "c1",
				droppedAtTimestamp: "2026-09-21T17:55:00.000Z",
			}),
		]);

		expect(await store.regret()).toEqual([]);
		await store.close();
	});
});
