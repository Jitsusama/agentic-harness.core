/**
 * Built-in terminal drivers, in the order discovery tries them when
 * nothing else decides: the emulators that can launch a window under
 * their own control first, then the multiplexers, then the fallback,
 * which prints and always works.
 */

import type { TerminalDriver } from "../../terminal/types.js";
import { fallback } from "./drivers/fallback.js";
import { kitty } from "./drivers/kitty.js";
import { tmux } from "./drivers/tmux.js";
import { wezterm } from "./drivers/wezterm.js";
import { zellij } from "./drivers/zellij.js";

export const BUILTIN_TERMINAL_DRIVERS: readonly TerminalDriver[] = [
	kitty,
	wezterm,
	zellij,
	tmux,
	fallback,
];
