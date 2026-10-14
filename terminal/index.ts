/**
 * Public surface of the terminal library.
 *
 * Opens shells in a window, a tab or a pane of whatever terminal the
 * person uses, types into them and asks whether they are still there.
 * `openTerminal` and `openTerminals` are the way in: they discover what
 * terminals there are, apply the person's `terminal` settings and plan
 * how to open each shell. Drivers for kitty, wezterm, tmux and zellij
 * are built in, any other terminal can be launched from a config entry,
 * and a package can register a driver of its own.
 */

export {
	BUILTIN_LAUNCHERS,
	type LauncherForm,
	type LauncherSpec,
} from "../internal/terminal/launchers.js";
export {
	type DiscoveryInputs,
	type DriverReach,
	discoverTerminals,
	type LauncherReach,
	sightChain,
	type TerminalLandscape,
} from "./discover.js";
export {
	currentPlatform,
	describePlan,
	mergedLaunchers,
	OPEN_CONCURRENCY,
	type OpenedHow,
	type OpenedOutcome,
	type OpenedTerminal,
	type OpenOptions,
	type OpenRequest,
	openTerminal,
	openTerminals,
	printedLine,
} from "./open.js";
export {
	describeLayer,
	type PlanningExclusions,
	planTerminal,
	type TerminalControl,
	type TerminalPlan,
	type TerminalPlanResult,
	type TerminalTier,
	usableTerminals,
} from "./plan.js";
export {
	clearTerminalDrivers,
	registerBuiltinTerminalDrivers,
	registerTerminalDriver,
	unregisterTerminalDriver,
} from "./register.js";
export {
	getLivenessProvider,
	getTerminalDriver,
	getTypeProvider,
	identifyCurrentTerminal,
	listTerminalDrivers,
	resolveDriver,
	spawnTerminal,
	spawnTerminalSurface,
} from "./resolve.js";
export {
	type Chosen,
	DEFAULT_TERMINAL_LAYOUT,
	DEFAULT_TERMINAL_NESTING,
	parseTerminalSettings,
	type ResolvedTerminalChoice,
	readTerminalChoice,
	resolveTerminalChoice,
	type TerminalChoice,
	type TerminalLauncherSetting,
	type TerminalLayer,
	type TerminalNestingSetting,
	type TerminalPlace,
	type TerminalSettings,
	type TerminalSettingsParse,
} from "./settings.js";
export type {
	TerminalDriver,
	TerminalKind,
	TerminalLaunchCapability,
	TerminalLaunchContext,
	TerminalLayout,
	TerminalLivenessCapability,
	TerminalNesting,
	TerminalPlatform,
	TerminalProbe,
	TerminalRequest,
	TerminalSessionHandle,
	TerminalSighting,
	TerminalTypeCapability,
} from "./types.js";
export {
	rendersLayout,
	TERMINAL_LAYOUTS,
	terminalHandleKey,
} from "./types.js";
