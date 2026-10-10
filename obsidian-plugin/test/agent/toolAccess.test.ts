import { describe, expect, it } from "vitest";
import { isWriteTool, PROPOSE_EDIT_DEF, toolAccess, type ToolDecision, type ToolRunKind } from "../../src/agent/toolAccess";
import { VAULT_WRITE_TOOLS } from "../../src/mcp/writeTools";
import { RESEARCH_WRITE_TOOLS } from "../../src/research/tools";

const read = "vault_search";
const write = "note_create";
const propose = PROPOSE_EDIT_DEF.name;
const external = "mcp__github__create_issue";

const table: Record<ToolRunKind, Record<string, ToolDecision>> = {
  off: { [read]: "deny", [write]: "deny", [propose]: "deny", [external]: "deny" },
  plan: { [read]: "run", [write]: "deny", [propose]: "deny", [external]: "deny" },
  chat: { [read]: "run", [write]: "confirm", [propose]: "propose", [external]: "run" },
  propose: { [read]: "run", [write]: "deny", [propose]: "propose", [external]: "deny" },
};

describe("toolAccess", () => {
  for (const [kind, row] of Object.entries(table) as Array<[ToolRunKind, Record<string, ToolDecision>]>) {
    it(`decides every tool class for a ${kind} run and offers exactly the undenied ones`, () => {
      const access = toolAccess(kind);
      for (const [name, decision] of Object.entries(row)) expect(access.decide(name)).toBe(decision);
      const candidates = Object.keys(row).map((name) => ({ name }));
      expect(access.offered(candidates).map((t) => t.name)).toEqual(Object.keys(row).filter((name) => row[name] !== "deny"));
    });
  }

  it("treats every registered write tool as a write in every run kind", () => {
    const writes = [...VAULT_WRITE_TOOLS, ...RESEARCH_WRITE_TOOLS];
    expect(writes.length).toBeGreaterThan(0);
    for (const name of writes) {
      expect(isWriteTool(name)).toBe(true);
      expect(toolAccess("chat").decide(name)).toBe("confirm");
      for (const kind of ["off", "plan", "propose"] as const) expect(toolAccess(kind).decide(name)).toBe("deny");
    }
  });

  it("never treats propose_note_edit as a write", () => {
    expect(isWriteTool(propose)).toBe(false);
  });
});
