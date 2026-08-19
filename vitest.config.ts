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
	},
});
