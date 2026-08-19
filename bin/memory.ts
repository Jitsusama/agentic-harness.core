/**
 * The CLI adapter's memory wiring: scope resolution plus the four
 * request/response shapes the `memory` subcommands speak. Domain
 * logic (the store itself) lives in `../memory`; this file is
 * where a CLI-specific "what scope applies right now" answer gets
 * made, since core deliberately doesn't own that (see
 * memory/scope.ts).
 *
 * Each call opens and closes its own connection: this CLI is
 * stateless per invocation like every other subcommand here, and
 * SQLite is built for exactly this access pattern.
 */

import { memoryDbPath, openMemoryStore, type Scope } from "../memory/index.js";

/** The scope a call gets when it doesn't name one: the project at cwd. */
function defaultScope(): Scope {
	return { kind: "project", path: process.cwd() };
}

interface RetainRequest {
	text: string;
	tags?: string[];
	source?: string;
	scope?: Scope;
}

export async function runMemoryRetain(input: string): Promise<unknown> {
	const req = JSON.parse(input) as RetainRequest;
	const store = await openMemoryStore(await memoryDbPath());
	try {
		return await store.retain({
			scope: req.scope ?? defaultScope(),
			text: req.text,
			...(req.tags ? { tags: req.tags } : {}),
			...(req.source ? { source: req.source } : {}),
		});
	} finally {
		await store.close();
	}
}

interface RecallRequest {
	query?: string;
	limit?: number;
	scope?: Scope;
	includeGlobal?: boolean;
}

export async function runMemoryRecall(input: string): Promise<unknown> {
	const req = JSON.parse(input || "{}") as RecallRequest;
	const store = await openMemoryStore(await memoryDbPath());
	try {
		return await store.recall({
			scope: req.scope ?? defaultScope(),
			...(req.query ? { text: req.query } : {}),
			...(req.limit ? { limit: req.limit } : {}),
			...(req.includeGlobal !== undefined
				? { includeGlobal: req.includeGlobal }
				: {}),
		});
	} finally {
		await store.close();
	}
}

interface ReflectRequest {
	question: string;
	scope?: Scope;
}

export async function runMemoryReflect(input: string): Promise<unknown> {
	const req = JSON.parse(input) as ReflectRequest;
	const store = await openMemoryStore(await memoryDbPath());
	try {
		const text = await store.reflect({
			scope: req.scope ?? defaultScope(),
			question: req.question,
		});
		return { text };
	} finally {
		await store.close();
	}
}

interface EditRequest {
	id: number;
	text?: string;
	tags?: string[];
	invalidate?: boolean;
}

export async function runMemoryEdit(input: string): Promise<unknown> {
	const req = JSON.parse(input) as EditRequest;
	const store = await openMemoryStore(await memoryDbPath());
	try {
		if (req.invalidate) {
			await store.invalidate(req.id);
			return { ok: true, invalidated: req.id };
		}
		const fact = await store.edit(req.id, {
			...(req.text !== undefined ? { text: req.text } : {}),
			...(req.tags !== undefined ? { tags: req.tags } : {}),
		});
		return { ok: fact !== null, fact };
	} finally {
		await store.close();
	}
}
