import { defineConfig } from "vitest/config";

// tests/browser drives a real Chrome and runs through `pnpm test:browser`
// (which `pnpm check` runs too); left in the default lane it would slow
// every ordinary `pnpm test` and fail outright on a machine with no
// browser, so it has a config of its own.
export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		exclude: ["tests/browser/**"],
		globalSetup: ["./tests/setup/temp-root.ts"],
		// Fourteen files run real git, a few dozen commands a test, each
		// under a second alone. Beside other work, at loads of 23 and of
		// 92, they passed vitest's five seconds one file after another,
		// each raised by hand as it failed. A hang still fails, later.
		testTimeout: 30_000,
	},
});
