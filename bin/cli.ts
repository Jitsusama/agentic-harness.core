#!/usr/bin/env node
/**
 * A thin, stateless-per-invocation CLI over the domain modules in
 * `src/`. Each call reads whatever loop state it needs from a
 * small JSON file it owns, applies one command, and writes the
 * result back out — no daemon, no port, no long-lived process.
 * This is the shape both a Bash-invoked Claude Code skill and a
 * future hook dispatcher need: one process, one JSON in, one JSON
 * out.
 *
 * This file is the CLI adapter, not domain logic — argument
 * parsing and state-file I/O live here so `src/tdd` stays pure.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	type Attestation,
	attest,
	idleLoop,
	type Loop,
	standingReminder,
} from "../tdd/index.js";

/** Where a loop's state lives when the caller doesn't override it. */
const DEFAULT_STATE_FILE = ".agentic-harness/tdd-loop.json";

interface Options {
	domain: string;
	command: string;
	stateFile: string;
}

function parseArgs(argv: string[]): Options {
	const [domain, command, ...rest] = argv;
	if (!domain || !command) {
		throw new Error(
			"Usage: agentic-harness-core <domain> <command> [--state-file <path>]",
		);
	}
	let stateFile = DEFAULT_STATE_FILE;
	for (let i = 0; i < rest.length; i++) {
		if (rest[i] === "--state-file") {
			const value = rest[i + 1];
			if (!value) {
				throw new Error("--state-file requires a path");
			}
			stateFile = value;
			i++;
		}
	}
	return { domain, command, stateFile };
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

async function loadLoop(stateFile: string): Promise<Loop> {
	try {
		const raw = await readFile(stateFile, "utf8");
		return JSON.parse(raw) as Loop;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return idleLoop();
		}
		throw error;
	}
}

async function saveLoop(stateFile: string, loop: Loop): Promise<void> {
	await mkdir(dirname(stateFile), { recursive: true });
	await writeFile(stateFile, `${JSON.stringify(loop, null, 2)}\n`);
}

async function runTddAttest(stateFile: string): Promise<unknown> {
	const input = await readStdin();
	const attestation = JSON.parse(input) as Attestation;
	const loop = await loadLoop(stateFile);
	const result = attest(loop, attestation);
	await saveLoop(stateFile, result.loop);
	return result;
}

async function runTddStatus(stateFile: string): Promise<unknown> {
	const loop = await loadLoop(stateFile);
	return { loop, reminder: standingReminder(loop) };
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));

	if (options.domain === "tdd" && options.command === "attest") {
		process.stdout.write(
			`${JSON.stringify(await runTddAttest(options.stateFile))}\n`,
		);
		return;
	}
	if (options.domain === "tdd" && options.command === "status") {
		process.stdout.write(
			`${JSON.stringify(await runTddStatus(options.stateFile))}\n`,
		);
		return;
	}

	throw new Error(`Unknown command: ${options.domain} ${options.command}`);
}

main().catch((error: unknown) => {
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
