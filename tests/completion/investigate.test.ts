import { describe, expect, it, vi } from "vitest";
import { runInvestigation } from "../../completion/investigate.js";
import type {
	CompleteSimple,
	CompletionRegistry,
} from "../../completion/types.js";

const glm = { id: "glm-5.2", provider: "fireworks" };

const ZERO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** A `complete` stub that is never expected to run. */
const unreachable: CompleteSimple = vi.fn(() => {
	throw new Error("complete should not have been called");
});

const request = {
	systemPrompt: "s",
	messages: [] as unknown[],
	tools: [],
	maxSteps: 1,
};

describe("runInvestigation error paths", () => {
	it("returns not-ok when no model is available", async () => {
		const registry: CompletionRegistry = {
			getAvailable: () => [],
			find: () => undefined,
			getApiKeyAndHeaders: async () => ({ ok: true }),
		};

		const result = await runInvestigation(registry, request, unreachable);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("no model");
	});

	it("surfaces an auth-not-configured failure with the model named", async () => {
		const registry: CompletionRegistry = {
			getAvailable: () => [glm],
			find: () => undefined,
			getApiKeyAndHeaders: async () => ({ ok: false, error: "no key" }),
		};

		const result = await runInvestigation(registry, request, unreachable);

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

		const result = await runInvestigation(registry, request, unreachable);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("auth resolution threw");
		expect(result.error).toContain("boom");
	});
});

describe("runInvestigation against a fake completion backend", () => {
	const registry: CompletionRegistry = {
		getAvailable: () => [glm],
		find: () => undefined,
		getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k" }),
	};

	it("answers directly when the model calls no tool", async () => {
		const complete: CompleteSimple = async () => ({
			content: [{ type: "text", text: "no suspicion found" }],
			usage: ZERO_USAGE,
			stopReason: "end",
		});

		const result = await runInvestigation(
			registry,
			{ systemPrompt: "s", messages: [], tools: [], maxSteps: 3 },
			complete,
		);

		expect(result.ok).toBe(true);
		expect(result.text).toBe("no suspicion found");
		expect(result.steps).toBe(1);
	});

	it("runs a tool call, feeds the result back, and answers on the next step", async () => {
		let step = 0;
		const complete: CompleteSimple = async (_model, context) => {
			step += 1;
			if (step === 1) {
				return {
					// The compat surface's tool-call shape is typed narrowly
					// upstream (content only declares type/text) and cast
					// through unknown at the call site, same as production.
					content: [
						{
							type: "toolCall",
							id: "1",
							name: "grep",
							arguments: { pattern: "TODO" },
						},
					] as unknown as Array<{ type: string; text?: string }>,
					usage: ZERO_USAGE,
					stopReason: "tool_calls",
				};
			}
			const seenToolResult = (
				context as unknown as { messages: Array<{ role?: string }> }
			).messages.some((m) => m.role === "toolResult");
			expect(seenToolResult).toBe(true);
			return {
				content: [{ type: "text", text: "found one TODO" }],
				usage: ZERO_USAGE,
				stopReason: "end",
			};
		};

		const result = await runInvestigation(
			registry,
			{
				systemPrompt: "s",
				messages: [],
				tools: [
					{
						name: "grep",
						description: "search",
						parameters: {},
						execute: async (args) => `matched: ${args.pattern}`,
					},
				],
				maxSteps: 3,
			},
			complete,
		);

		expect(result.ok).toBe(true);
		expect(result.text).toBe("found one TODO");
		expect(result.steps).toBe(2);
	});

	it("reports the step budget exhausted when the model keeps calling tools", async () => {
		const complete: CompleteSimple = async () => ({
			content: [
				{ type: "toolCall", id: "1", name: "grep", arguments: {} },
			] as unknown as Array<{ type: string; text?: string }>,
			usage: ZERO_USAGE,
			stopReason: "tool_calls",
		});

		const result = await runInvestigation(
			registry,
			{
				systemPrompt: "s",
				messages: [],
				tools: [
					{
						name: "grep",
						description: "search",
						parameters: {},
						execute: async () => "no matches",
					},
				],
				maxSteps: 2,
			},
			complete,
		);

		expect(result.ok).toBe(true);
		expect(result.error).toBe("step budget exhausted");
		expect(result.steps).toBe(2);
	});
});
