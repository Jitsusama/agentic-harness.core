/**
 * Importing this package loads none of its heaviest dependencies.
 *
 * pi loads every extension at startup, and an extension that imports
 * any entry point here pays for whatever that entry point imports
 * eagerly. googleapis bundles a client for every Google API and jsdom
 * an entire browser DOM; together with puppeteer and defuddle they
 * cost a pi process most of a second and close to 300 MB before any
 * tool runs, for work most sessions never ask for. Each loads on the
 * first call that needs it instead.
 *
 * This imports every export of the built package in a child node,
 * with a resolve hook watching, and fails if any of them reaches one
 * of these packages' entry points.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");

/** The entry point each heavy package resolves to when loaded whole. */
const HEAVY: Record<string, RegExp> = {
	googleapis: /\/googleapis\/build\/src\/index\.js$/,
	"puppeteer-core": /\/puppeteer-core\/lib\/puppeteer\/puppeteer-core\.js$/,
	jsdom: /\/jsdom\/lib\/api\.js$/,
	defuddle: /\/defuddle\/dist\/node\.js$/,
};

function loadedByImportingEverything(): string[] {
	const exports: Record<string, string> = JSON.parse(
		readFileSync(join(ROOT, "package.json"), "utf8"),
	).exports;
	const entries = Object.values(exports).map(
		(target) => new URL(target, `file://${ROOT}/`).href,
	);
	const script = `
		import { registerHooks } from "node:module";
		const heavy = ${JSON.stringify(Object.fromEntries(Object.entries(HEAVY).map(([name, pattern]) => [name, pattern.source])))};
		const loaded = new Set();
		registerHooks({
			resolve(specifier, context, next) {
				const result = next(specifier, context);
				for (const [name, pattern] of Object.entries(heavy)) {
					if (new RegExp(pattern).test(result.url)) loaded.add(name);
				}
				return result;
			},
		});
		for (const entry of ${JSON.stringify(entries)}) await import(entry);
		console.log(JSON.stringify([...loaded].sort()));
	`;
	const output = execFileSync(
		process.execPath,
		["--input-type=module", "-e", script],
		{ cwd: ROOT, encoding: "utf8" },
	);
	return JSON.parse(output.trim().split("\n").at(-1) ?? "[]");
}

describe("heavy dependencies", () => {
	it("stay unloaded when every entry point is imported", () => {
		expect(loadedByImportingEverything()).toEqual([]);
	});
});
