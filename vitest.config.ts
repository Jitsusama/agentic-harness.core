import { defineConfig } from "vitest/config";

// tests/browser drives a real Chrome and needs `npm run test:browser`
// (or a project checkout with Chrome installed) to be worth anything;
// left in the default lane it would slow every ordinary `npm test`
// and fail outright on a machine with no browser. Excluded here for
// the same reason agentic-harness.pi keeps its own browser suite in
// a separate vitest project.
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
