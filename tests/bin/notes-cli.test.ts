import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultNotesRoot } from "../../bin/notes.js";

describe("defaultNotesRoot", () => {
	it("uses XDG_DATA_HOME when set", () => {
		expect(defaultNotesRoot({ XDG_DATA_HOME: "/data" }, "/home/x")).toBe(
			join("/data", "agentic-harness", "notes"),
		);
	});

	it("falls back to ~/.local/share when XDG_DATA_HOME is unset", () => {
		expect(defaultNotesRoot({}, "/home/x")).toBe(
			join("/home/x", ".local", "share", "agentic-harness", "notes"),
		);
	});

	it("falls back when XDG_DATA_HOME is empty", () => {
		expect(defaultNotesRoot({ XDG_DATA_HOME: "" }, "/home/x")).toBe(
			join("/home/x", ".local", "share", "agentic-harness", "notes"),
		);
	});
});
