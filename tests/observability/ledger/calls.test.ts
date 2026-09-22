import { describe, expect, it } from "vitest";
import {
	openTurnStore,
	type ToolCallRecord,
} from "../../../observability/ledger/index.js";

function call(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
	return {
		digest: "c1",
		sessionId: "s1",
		entryId: "a1",
		callId: "t1",
		timestamp: "2026-09-21T17:55:00.000Z",
		name: "bash",
		argsDigest: "args-ls",
		path: null,
		resultChars: 100,
		resultDigest: "res-1",
		isError: false,
		...overrides,
	};
}

describe("tool calls in the store", () => {
	it("round-trips a call with every field intact", async () => {
		const store = await openTurnStore(":memory:");
		await store.recordCalls([call({ path: "/src/a.ts", isError: true })]);

		const [row] = await store.queryCalls();
		expect(row).toEqual(call({ path: "/src/a.ts", isError: true }));
		await store.close();
	});

	it("bills a call once however many logs hold it", async () => {
		// Forked logs repeat a call verbatim, digest included, the same
		// way they repeat a turn.
		const store = await openTurnStore(":memory:");
		const first = await store.recordCalls([call()]);
		const again = await store.recordCalls([call({ sessionId: "fork" })]);

		expect(first.inserted).toBe(1);
		expect(again.inserted).toBe(0);
		expect(await store.queryCalls()).toHaveLength(1);
		await store.close();
	});

	it("keeps an unanswered call, with its result unknown rather than empty", async () => {
		const store = await openTurnStore(":memory:");
		await store.recordCalls([
			call({ resultChars: null, resultDigest: null, isError: null }),
		]);

		const [row] = await store.queryCalls();
		expect(row.resultChars).toBeNull();
		expect(row.isError).toBeNull();
		await store.close();
	});

	it("names arguments asked more than once in one session, heaviest first", async () => {
		// The answer was already in the context when the call was made, so
		// the result was admitted twice. No value judgement is involved,
		// which is what makes this safe to act on.
		const store = await openTurnStore(":memory:");
		await store.recordCalls([
			call({ digest: "c1", argsDigest: "ls", resultChars: 10 }),
			call({ digest: "c2", argsDigest: "ls", resultChars: 10 }),
			call({ digest: "c3", argsDigest: "big", resultChars: 500 }),
			call({ digest: "c4", argsDigest: "big", resultChars: 500 }),
			call({ digest: "c5", argsDigest: "big", resultChars: 500 }),
			call({ digest: "c6", argsDigest: "once", resultChars: 9000 }),
		]);

		const repeats = await store.repeatedCalls();
		expect(repeats).toHaveLength(2);
		expect(repeats[0]).toMatchObject({
			argsDigest: "big",
			name: "bash",
			asked: 3,
			repeated: 2,
			repeatedChars: 1000,
		});
		expect(repeats[1].argsDigest).toBe("ls");
		await store.close();
	});

	it("does not call the same arguments in two sessions a repeat", async () => {
		// A second session has none of the first session's context, so
		// asking again is the only way it could know.
		const store = await openTurnStore(":memory:");
		await store.recordCalls([
			call({ digest: "c1", sessionId: "s1", argsDigest: "ls" }),
			call({ digest: "c2", sessionId: "s2", argsDigest: "ls" }),
		]);

		expect(await store.repeatedCalls()).toEqual([]);
		await store.close();
	});
});
