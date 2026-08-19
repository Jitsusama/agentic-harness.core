/**
 * Project detection for the verify domain: walk up to the nearest
 * package.json and read its scripts, so the check command can be
 * resolved without the caller having to name a project directory.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ProjectInfo {
	readonly dir: string;
	readonly scripts: Readonly<Record<string, string>>;
	readonly packageManager: string;
}

/** Walk up from startDir to the nearest package.json, reading its scripts. */
export function findProject(startDir: string): ProjectInfo | null {
	let dir = startDir;
	while (true) {
		const pkgPath = join(dir, "package.json");
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
					scripts?: Record<string, string>;
				};
				return {
					dir,
					scripts: pkg.scripts ?? {},
					packageManager: detectPackageManager(dir),
				};
			} catch {
				return null;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** Infer the package manager from the lockfile present in dir. */
export function detectPackageManager(dir: string): string {
	if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(dir, "yarn.lock"))) return "yarn";
	if (existsSync(join(dir, "package-lock.json"))) return "npm";
	return "pnpm";
}
