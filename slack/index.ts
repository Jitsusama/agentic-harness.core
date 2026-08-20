/**
 * Slack library: API client, credential state, renderers,
 * resolvers and shared types.
 *
 * Public entry point for external consumers. The interactive auth
 * orchestration (`ensureAuthenticated`, the setup wizard) needs a
 * host's UI and is not here; an adapter builds that from the
 * pieces `./auth` exports.
 */

export * from "./api/index.js";
export * from "./auth/index.js";
export { formatSlackBlock } from "./block-message.js";
export {
	extractCellText,
	extractTables,
	mrkdwnToBlocks,
	mrkdwnToCell,
	parseMrkdwnToElements,
	renderRichTextCell,
	tableToBlock,
} from "./blocks.js";
export {
	type SlackGateDecision,
	slackGateDecision,
} from "./content-gate.js";
export { detectSlackViolations, type SlackViolation } from "./detect.js";
export * from "./renderers/index.js";
export * from "./resolvers/index.js";

// Re-export domain types (omit router internals).
export type {
	Conversation,
	ConversationKind,
	MessageTarget,
	OAuthApp,
	SlackAttachment,
	SlackChannel,
	SlackColumnSetting,
	SlackFile,
	SlackMessage,
	SlackReaction,
	SlackTable,
	SlackUser,
	StoredToken,
} from "./types.js";
