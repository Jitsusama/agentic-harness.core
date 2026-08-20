import { describe, expect, it, vi } from "vitest";
import { runSideCompletion } from "../../completion/side.js";
import type {
	CompleteSimple,
	CompletionRegistry,
} from "../../completion/types.js";

const glm = { id: "glm-5.2", provider: "fireworks" };

/** A `complete` stub that is never expected to run. */
const unreachable: CompleteSimple = vi.fn(() => {
	throw new Error("complete should not have been called");
});

describe("runSideCompletion error paths", () => {
	it("returns not-ok when no model is available", async () => {
		const registry: CompletionRegistry = {
			getAvailable: () => [],
			find: () => undefined,
			getApiKeyAndHeaders: async () => ({ ok: true }),
		};
		const result = await runSideCompletion(
			registry,
			{ systemPrompt: "s", prompt: "hi" },
			unreachable,
		);
		expect(result.ok).toBe(false);
		expect(result.error).toContain("no model");
	});

	it("surfaces an auth-not-configured failure with the model named", async () => {
		const registry: CompletionRegistry = {
			getAvailable: () => [glm],
			find: () => undefined,
			getApiKeyAndHeaders: async () => ({ ok: false, error: "no key" }),
		};
		const result = await runSideCompletion(
			registry,
			{ systemPrompt: "s" },
			unreachable,
		);
		expect(result.ok).toBe(false);
		expect(result.provider).toBe("fireworks");
		expect(result.model).toBe("glm-5.2");
		expect(result.error).toContain("auth not configured");
	});

	it("surfaces a throwing auth resolution", async () => {
		const registry: CompletionRegistry = {
			getAvailable: () => [glm],
			find: () => undefined,
			getApiKeyAndHeaders: async () => {
				throw new Error("boom");
			},
		};
		const result = await runSideCompletion(
			registry,
			{ systemPrompt: "s" },
			unreachable,
		);
		expect(result.ok).toBe(false);
		expect(result.error).toContain("auth resolution threw");
		expect(result.error).toContain("boom");
	});
});

describe("runSideCompletion against a fake completion backend", () => {
	const registry: CompletionRegistry = {
		getAvailable: () => [glm],
		find: () => undefined,
		getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k" }),
	};

	it("returns the completed text on success", async () => {
		const complete: CompleteSimple = async (model, context) => {
			expect(model).toEqual(glm);
			expect(context.systemPrompt).toBe("s");
			return {
				content: [{ type: "text", text: "hello" }],
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "end",
			};
		};

		const result = await runSideCompletion(
			registry,
			{ systemPrompt: "s", prompt: "hi" },
			complete,
		);

		expect(result.ok).toBe(true);
		expect(result.text).toBe("hello");
		expect(result.usage?.totalTokens).toBe(2);
	});

	it("reports not-ok when the completion itself errors", async () => {
		const complete: CompleteSimple = async () => ({
			content: [],
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "error",
			errorMessage: "backend refused",
		});

		const result = await runSideCompletion(
			registry,
			{ systemPrompt: "s", prompt: "hi" },
			complete,
		);

		expect(result.ok).toBe(false);
		expect(result.error).toBe("backend refused");
	});

	it("surfaces a throwing completion call", async () => {
		const complete: CompleteSimple = async () => {
			throw new Error("network down");
		};

		const result = await runSideCompletion(
			registry,
			{ systemPrompt: "s", prompt: "hi" },
			complete,
		);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("completion threw");
		expect(result.error).toContain("network down");
	});
});
