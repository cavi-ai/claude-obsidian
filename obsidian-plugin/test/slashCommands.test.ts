import { describe, it, expect } from "vitest";
import { parseSlashQuery, filterCommands, moveSelection, SLASH_COMMANDS } from "../src/view/slashCommands";

describe("parseSlashQuery", () => {
  it("returns the token after a leading slash", () => {
    expect(parseSlashQuery("/sum")).toBe("sum");
    expect(parseSlashQuery("/")).toBe("");
    expect(parseSlashQuery("/ASK")).toBe("ask"); // lowercased
  });
  it("is null when not a bare command (prose, or a space typed)", () => {
    expect(parseSlashQuery("hello")).toBeNull();
    expect(parseSlashQuery("path/to/thing")).toBeNull();
    expect(parseSlashQuery("/ask question")).toBeNull(); // space → no longer composing a command
    expect(parseSlashQuery("")).toBeNull();
  });
});

describe("filterCommands", () => {
  const cmds = SLASH_COMMANDS;
  it("returns everything for an empty query", () => {
    expect(filterCommands(cmds, "")).toHaveLength(cmds.length);
  });
  it("ranks exact + prefix matches first", () => {
    const r = filterCommands(cmds, "sum");
    expect(r[0].name).toBe("summarize"); // matched via prefix/alias
  });
  it("matches aliases", () => {
    expect(filterCommands(cmds, "tldr").map((c) => c.name)).toContain("summarize");
    expect(filterCommands(cmds, "clear").map((c) => c.name)).toContain("new");
  });
  it("falls back to description substring matches", () => {
    const r = filterCommands(cmds, "vault");
    expect(r.map((c) => c.name)).toContain("ask");
  });
  it("returns nothing for gibberish", () => {
    expect(filterCommands(cmds, "zzzxyq")).toHaveLength(0);
  });
});

describe("moveSelection", () => {
  it("wraps around both ends", () => {
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(1, 1, 3)).toBe(2);
  });
  it("is safe for an empty list", () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
  });
});

describe("catalog integrity", () => {
  it("every prompt command has a prompt; every action has an action id", () => {
    for (const c of SLASH_COMMANDS) {
      if (c.kind === "prompt") expect(c.prompt, c.name).toBeTruthy();
      else expect(c.action, c.name).toBeTruthy();
    }
  });
  it("names are unique and slug-shaped", () => {
    const seen = new Set<string>();
    for (const c of SLASH_COMMANDS) {
      expect(/^[a-z0-9-]+$/.test(c.name), c.name).toBe(true);
      expect(seen.has(c.name)).toBe(false);
      seen.add(c.name);
    }
  });
});
