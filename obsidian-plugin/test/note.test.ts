import { describe, it, expect } from "vitest";
import { renderDigestNote } from "../src/memory/note";
import type { SessionDigest } from "../src/memory/transcript";

const digest: SessionDigest = {
  sessionId: "s1",
  model: "claude-opus-4-8",
  gitBranch: "feat/x",
  cwd: "/v",
  startedAt: "2026-06-03T00:00:00Z",
  endedAt: "2026-06-03T00:10:00Z",
  userTurns: 1,
  assistantTurns: 1,
  prose: [
    { role: "user", text: "Fix the parser" },
    { role: "assistant", text: "Done." },
  ],
  toolActions: [{ tool: "Edit", target: "src/parse.ts" }],
  filesTouched: ["Notes/Daily.md", "src/parse.ts"],
  inputTokens: 100,
  outputTokens: 40,
};

describe("renderDigestNote", () => {
  it("emits frontmatter with provenance and the session id", () => {
    const md = renderDigestNote(digest, { baseTags: ["claude", "session"] });
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("claude-session: s1");
    expect(md).toContain("model: claude-opus-4-8");
    expect(md).toContain("input-tokens: 100");
    expect(md).toContain("Fix the parser");
    expect(md).toContain("Edit");
  });

  it("wikilinks touched files that resolve to vault notes, code-spans the rest", () => {
    const md = renderDigestNote(digest, {
      baseTags: ["claude"],
      vaultNoteBasenames: new Set(["Daily"]),
    });
    expect(md).toContain("[[Daily]]");
    expect(md).toContain("`src/parse.ts`");
  });
});
