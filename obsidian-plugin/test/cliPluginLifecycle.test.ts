import { App, FileSystemAdapter } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClaudeCompanionPlugin from "../src/main";
import { McpHttpServer } from "../src/mcp/server";
import { ClaudeCliSession } from "../src/cli/session";
import { DEFAULT_SETTINGS } from "../src/types";

afterEach(() => vi.restoreAllMocks());

const runtime = () => ({
  findClaude: async () => ({ executable: "claude", version: "2.1.257" }),
  authStatus: async () => ({ loggedIn: true, method: "claude.ai" }),
  writeSystemPromptFile: async () => "/tmp/p.md",
  removeFile: vi.fn(async () => undefined),
  spawn: vi.fn(() => { throw new Error("spawn is stubbed at the session level"); }),
});

function plugin(rt: ReturnType<typeof runtime>): ClaudeCompanionPlugin {
  const app = new App();
  (app.vault as unknown as { adapter: unknown }).adapter = new FileSystemAdapter("/vault");
  const p = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  Object.assign(p as unknown as Record<string, unknown>, {
    app,
    settings: { ...structuredClone(DEFAULT_SETTINGS), chatBackend: "claude-cli", apiKey: "" },
    convState: { conversations: [{ id: "c1", title: "t", createdAt: 1, updatedAt: 1, messages: [] }, { id: "c2", title: "t", createdAt: 1, updatedAt: 1, messages: [] }], activeId: "c1" },
    cliSessions: new Map(),
    chatBridge: null,
    chatBridgeToken: null,
    cliBinding: null,
    cliPromptFiles: new Set(),
    utilityLifecycleEnded: false,
    utilityLifecycleGeneration: 0,
    mcpLifecycleGeneration: 0,
    mcpLifecycleEnded: false,
    _router: null,
    persist: async () => undefined,
    cliRuntime: () => rt,
    composeSystemPrompt: () => "sys",
    agentTools: () => ({ definitions: () => [], call: async () => "" }),
  });
  return p;
}

describe("plugin Claude CLI lifecycle", () => {
  it("starts one chat bridge on port 0 with a fresh token, reuses a session per conversation, and tears everything down on unload", async () => {
    const start = vi.spyOn(McpHttpServer.prototype, "start").mockResolvedValue(undefined);
    vi.spyOn(McpHttpServer.prototype, "isRunning").mockReturnValue(true);
    vi.spyOn(McpHttpServer.prototype, "address").mockReturnValue({ port: 4321 });
    const stop = vi.spyOn(McpHttpServer.prototype, "stop").mockResolvedValue(undefined);
    const run = vi.spyOn(ClaudeCliSession.prototype, "run").mockResolvedValue({ text: "", trace: [] });
    const close = vi.spyOn(ClaudeCliSession.prototype, "close").mockResolvedValue(undefined);
    const rt = runtime();
    const p = plugin(rt);
    await p.router().claudeCli.refresh();
    const deps = { confirmWrite: async () => true, proposeEdit: async () => "" };
    const a = await p.cliTurnRunner({ conversationId: "c1", planMode: false, agentMode: true, model: "claude-sonnet-5", deps, transcript: "" });
    const b = await p.cliTurnRunner({ conversationId: "c1", planMode: false, agentMode: true, model: "claude-sonnet-5", deps, transcript: "" });
    expect(a).toBe(b);
    expect(start).toHaveBeenCalledOnce();
    const c = await p.cliTurnRunner({ conversationId: "c2", planMode: false, agentMode: true, model: "claude-sonnet-5", deps, transcript: "" });
    expect(c).not.toBe(a);
    const off = await p.cliTurnRunner({ conversationId: "c1", planMode: false, agentMode: false, model: "claude-sonnet-5", deps, transcript: "" });
    expect(off).not.toBe(a);
    expect(run).not.toHaveBeenCalled();
    expect((p as unknown as { convState: { conversations: { id: string; cliSessionId?: string }[] } }).convState.conversations.every((x) => typeof x.cliSessionId === "string")).toBe(true);
    p.onunload();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(rt.removeFile).toHaveBeenCalledTimes(3);
  });

  it("spawns a fresh session and keeps history when the previous one is spent", async () => {
    vi.spyOn(McpHttpServer.prototype, "start").mockResolvedValue(undefined);
    vi.spyOn(McpHttpServer.prototype, "isRunning").mockReturnValue(true);
    vi.spyOn(McpHttpServer.prototype, "address").mockReturnValue({ port: 4321 });
    vi.spyOn(McpHttpServer.prototype, "stop").mockResolvedValue(undefined);
    vi.spyOn(ClaudeCliSession.prototype, "run").mockResolvedValue({ text: "", trace: [] });
    vi.spyOn(ClaudeCliSession.prototype, "close").mockResolvedValue(undefined);
    const rt = runtime();
    const p = plugin(rt);
    await p.router().claudeCli.refresh();
    const deps = { confirmWrite: async () => true, proposeEdit: async () => "" };
    const opts = { conversationId: "c1", planMode: false, agentMode: true, model: "claude-sonnet-5", deps, transcript: "" };
    const a = await p.cliTurnRunner(opts);
    type ConvOut = { convState: { conversations: { id: string; cliSessionId?: string; cliSessionHistory?: string[] }[] } };
    const firstConvo = () => (p as unknown as ConvOut).convState.conversations.find((c) => c.id === "c1")!;
    const firstId = firstConvo().cliSessionId;
    expect(typeof firstId).toBe("string");
    // The process is spent (interrupted or exited); run() is mocked so `child` stays null and interrupt() would no-op — spy isClosed directly instead.
    vi.spyOn(ClaudeCliSession.prototype, "isClosed").mockReturnValue(true);
    const b = await p.cliTurnRunner(opts);
    expect(b).not.toBe(a);
    expect(firstConvo().cliSessionId).not.toBe(firstId);
    expect(firstConvo().cliSessionHistory).toEqual([firstId]);
  });

  it("refuses to build a runner when the CLI is not signed in", async () => {
    const rt = runtime();
    rt.authStatus = async () => ({ loggedIn: false, method: "" });
    const p = plugin(rt);
    await p.router().claudeCli.refresh();
    await expect(p.cliTurnRunner({ conversationId: "c1", planMode: false, agentMode: true, model: "m", deps: { confirmWrite: async () => true, proposeEdit: async () => "" }, transcript: "" })).rejects.toThrow(/not signed in/);
  });
});
