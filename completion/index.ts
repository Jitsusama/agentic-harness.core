/**
 * Side completions: run a one-shot completion against a model
 * from the registry, off the agent's own loop.
 *
 * The advisor and correction capture both need a cheap second
 * model to distill or judge without disturbing the doer. This is
 * the shared mechanism, proven by the milestone-5 probe.
 *
 * Actually running a model is a port (`CompleteSimple`), not
 * something this package can do on its own: `runSideCompletion` and
 * `runInvestigation` both take one as a parameter. An adapter
 * resolves its own host's completion function and passes it in.
 */

export {
	type InvestigationRequest,
	type InvestigationResult,
	type LoopTool,
	runInvestigation,
} from "./investigate.js";
export {
	looksLikeGlm,
	type ModelRef,
	type ModelTarget,
	pickModel,
} from "./resolve.js";
export {
	runSideCompletion,
	type SideCompletionRequest,
	type SideCompletionResult,
} from "./side.js";
export type {
	CompatModule,
	CompleteSimple,
	CompletionMessage,
	CompletionRegistry,
} from "./types.js";
