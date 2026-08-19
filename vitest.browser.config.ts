import { defineConfig } from "vitest/config";

// The browser lane's own config, separate from vitest.config.ts's
// default lane (which excludes tests/browser). Run with
// `npm run test:browser`; needs a real Chrome (CHROME_PATH, or one
// findChrome() can locate on its own).
export default defineConfig({
	test: {
		include: ["tests/browser/**/*.test.ts"],
	},
});
