import { describe, it, expect } from "vitest";
import { App } from "obsidian";
import { ingestSession } from "../src/memory/ingest";

const rec = (o: object) => JSON.stringify(o);

// A transcript whose tool output leaks an Anthropic key.
const jsonl = [
  rec({ type: "user", cwd: "/v", sessionId: "sec1", timestamp: "2026-06-03T00:00:00Z", message: { role: "user", content: "deploy it" } }),
  rec({
    type: "assistant",
    timestamp: "2026-06-03T00:00:01Z",
    message: {
      role: "assistant",
      model: "claude-opus-4-8",
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [
        { type: "text", text: "Using key sk-ant-api03-DEADBEEFDEADBEEFDEADBEEF to deploy." },
        { type: "tool_use", name: "Bash", input: { command: "deploy --token sk-ant-api03-DEADBEEFDEADBEEFDEADBEEF" } },
      ],
    },
  }),
].join("\n");

function deps(app: App) {
  return { app, read: async () => jsonl, folder: "Claude/Sessions", baseTags: ["claude", "session"] };
}

describe("ingestSession", () => {
  it("never writes an unsanitized secret to the vault and reports redactions", async () => {
    const app = new App();
    const res = await ingestSession(deps(app), { id: "sec1", path: "/p/sec1.jsonl" });
    const content = await app.vault.cachedRead(res.file);
    expect(content).not.toContain("sk-ant-api03-DEADBEEFDEADBEEFDEADBEEF");
    expect(content).toContain("‹REDACTED›");
    expect(res.redactions).toBeGreaterThan(0);
    expect(res.sessionId).toBe("sec1");
  });

  it("is idempotent — re-ingesting the same session updates one note", async () => {
    const app = new App();
    await ingestSession(deps(app), { id: "sec1", path: "/p/sec1.jsonl" });
    await ingestSession(deps(app), { id: "sec1", path: "/p/sec1.jsonl" });
    const all = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("Claude/Sessions/"));
    expect(all.length).toBe(1);
  });
});
