import { describe, expect, it, vi } from "vitest";
import { routeTurn, streamAttempt } from "../../src/providers/chatTurn";
import type { AgentTurnResult } from "../../src/agent/loop";
import type { CompletionRequest } from "../../src/providers/types";
import type { StreamHandlers } from "../../src/types";

const request: CompletionRequest = { system: "s", messages: [], model: "m", maxTokens: 10 };
const provider = (stream: (request: CompletionRequest, handlers: StreamHandlers) => Promise<void>) => ({ stream });
const signal = () => new AbortController().signal;

describe("streamAttempt", () => {
  it("resolves with the error and the text so far when the stream rejects, never rejecting", async () => {
    const result = await streamAttempt(provider(async (_r, h) => { h.onText("Par"); throw Object.assign(new Error("transport crashed"), { status: 529 }); }), request, { onText: vi.fn() }, signal());
    expect(result.text).toBe("Par");
    expect(result.error?.message).toBe("transport crashed");
    expect((result.error as Error & { status?: number }).status).toBe(529);
  });

  it("resolves with the full text and no error on done, forwarding each delta", async () => {
    const onText = vi.fn();
    const result = await streamAttempt(provider(async (_r, h) => { h.onText("ans"); h.onDone("answer"); }), request, { onText }, signal());
    expect(result).toEqual({ text: "answer", trace: [] });
    expect(onText).toHaveBeenCalledWith("ans");
  });

  it("settles with partial text when an unresponsive stream is stopped", async () => {
    let handlers!: StreamHandlers;
    const controller = new AbortController();
    const turn = streamAttempt(provider(async (_r, h) => { handlers = h; return new Promise<void>(() => undefined); }), request, { onText: vi.fn() }, controller.signal);
    handlers.onText("Partial");
    controller.abort();
    await expect(turn).resolves.toMatchObject({ text: "Partial", aborted: true });
  });

  it("keeps the partial text as aborted when the stream resolves without done or error", async () => {
    await expect(streamAttempt(provider(async (_r, h) => { h.onText("half"); }), request, { onText: vi.fn() }, signal())).resolves.toEqual({ text: "half", trace: [], aborted: true });
  });

  it("ignores deltas after it settles", async () => {
    const onText = vi.fn();
    const result = await streamAttempt(provider(async (_r, h) => { h.onDone("done"); h.onText("late"); }), request, { onText }, signal());
    expect(result.text).toBe("done");
    expect(onText).not.toHaveBeenCalled();
  });
});

const ok = (text: string): AgentTurnResult => ({ text, trace: [] });
const failed = (text = "", message = "fetch failed"): AgentTurnResult => ({ text, trace: [], error: new Error(message) });
const local = { provider: { id: "ollama" as const }, model: "llama3.1" };
const providerOf = (result: AgentTurnResult) => (result.error as Error & { ccProvider?: string } | undefined)?.ccProvider;

describe("routeTurn", () => {
  it("returns a successful primary attempt without asking for a fallback", async () => {
    const localFallback = vi.fn();
    const result = await routeTurn({ backend: "auto", agent: false, providerId: "anthropic" }, { primary: async () => ok("hi"), localFallback, local: vi.fn() }, {});
    expect(result).toEqual(ok("hi"));
    expect(localFallback).not.toHaveBeenCalled();
  });

  it("keeps an agent turn's partial answer with a notice instead of falling back", async () => {
    const onNotice = vi.fn();
    const result = await routeTurn({ backend: "auto", agent: true, providerId: "anthropic" }, { primary: async () => failed("half an answer", "overloaded"), localFallback: vi.fn(), local: vi.fn() }, { onNotice });
    expect(result).toEqual({ text: "half an answer", trace: [] });
    expect(onNotice).toHaveBeenCalledWith("Turn ended early: overloaded");
  });

  it("never falls back from the on-device backend", async () => {
    const localFallback = vi.fn();
    const result = await routeTurn({ backend: "device", agent: false, providerId: "device" }, { primary: async () => failed(), localFallback, local: vi.fn() }, {});
    expect(providerOf(result)).toBe("device");
    expect(localFallback).not.toHaveBeenCalled();
  });

  it("answers locally with a notice when Claude is offline and a local model is reachable", async () => {
    const onNotice = vi.fn();
    const result = await routeTurn({ backend: "auto", agent: false, providerId: "anthropic" }, { primary: async () => failed(), localFallback: async () => local, local: async () => ok("local answer") }, { onNotice });
    expect(result).toEqual(ok("local answer"));
    expect(onNotice.mock.calls[0]![0]).toMatch(/answered locally with llama3\.1\.$/);
  });

  it("names the failing provider when no fallback applies or the fallback fails too", async () => {
    const none = await routeTurn({ backend: "auto", agent: false, providerId: "anthropic" }, { primary: async () => failed(), localFallback: async () => null, local: vi.fn() }, {});
    expect(providerOf(none)).toBe("anthropic");
    const both = await routeTurn({ backend: "auto", agent: false, providerId: "anthropic" }, { primary: async () => failed(), localFallback: async () => local, local: async () => failed("", "connection refused") }, {});
    expect(providerOf(both)).toBe("ollama");
  });

  it("does not fall back from a local backend", async () => {
    const run = vi.fn();
    const result = await routeTurn({ backend: "local", agent: false, providerId: "ollama" }, { primary: async () => failed(), localFallback: async () => local, local: run }, {});
    expect(run).not.toHaveBeenCalled();
    expect(providerOf(result)).toBe("ollama");
  });
});
