import { describe, it, expect } from "vitest";
import { App } from "obsidian";
import { renderDigestNote, writeDigestNote } from "../src/memory/note";
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

describe("writeDigestNote", () => {
  it("creates once, then modifies the same note on re-ingest (idempotent by session id)", async () => {
    const app = new App();
    const v1 = renderDigestNote({ ...digest, prose: [{ role: "user", text: "v1" }] }, { baseTags: ["claude"] });
    const f1 = await writeDigestNote(app, "Claude/Sessions", "s1", v1, "2026-06-03-first");
    const v2 = renderDigestNote({ ...digest, prose: [{ role: "user", text: "v2" }] }, { baseTags: ["claude"] });
    const f2 = await writeDigestNote(app, "Claude/Sessions", "s1", v2, "2026-06-03-first");

    expect(f2.path).toBe(f1.path);
    const all = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Claude/Sessions/"));
    expect(all.length).toBe(1);
    expect(await app.vault.cachedRead(f2)).toContain("v2");
  });
});
