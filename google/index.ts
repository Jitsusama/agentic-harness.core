/**
 * Google Workspace library: API clients, credential state,
 * renderers and shared types.
 *
 * Public entry point for external consumers. The interactive auth
 * orchestration (`ensureAuthenticated`, the setup wizard, the
 * device/web flow) needs a host's UI and is not here; an adapter
 * builds that from the pieces `./auth` exports.
 */

export * from "./apis/index.js";
export * from "./auth/index.js";
export * from "./renderers/index.js";

// Re-export domain types (omit router internals).
export type {
	BusyPeriod,
	CalendarEvent,
	CalendarFreeBusy,
	DocumentComment,
	DriveFile,
	EmailMessage,
	EmailMessageFull,
	FreeBusyResult,
	GoogleAccount,
	StoredCredentials,
} from "./types.js";
