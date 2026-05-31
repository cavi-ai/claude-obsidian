import { requestUrl } from "obsidian";
import type { ChatMessage, StreamHandlers } from "../types";
import { parseSseChunk, extractApiError } from "../claude/sse";
import { PING_MODEL } from "../claude/models";
import { type CompletionRequest, type Provider, type ProviderStatus, ProviderError, isAbort } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export class AnthropicProvider implements Provider {
  readonly id = "anthropic" as const;
  readonly label = "Claude (Anthropic API)";

  constructor(private apiKey: string) {}

  hasCredentials(): boolean {
    return this.apiKey.trim().length > 0;
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }

  private body(req: CompletionRequest, stream: boolean): string {
    return JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system || undefined,
      temperature: req.temperature,
      stream,
      messages: req.messages.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
    });
  }

  async stream(req: CompletionRequest, handlers: StreamHandlers): Promise<void> {
    if (!this.hasCredentials()) {
      handlers.onError?.(new ProviderError("No Anthropic API key set. Add one in Claude Companion settings."));
      return;
    }
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: this.headers(),
        body: this.body(req, true),
        signal: req.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new ProviderError(extractApiError(text, res.status), res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { text, remainder, error, usage } = parseSseChunk(buffer);
        buffer = remainder;
        if (error) throw new ProviderError(error);
        if (text) {
          full += text;
          handlers.onText(text);
        }
        if (usage) handlers.onUsage?.(usage);
      }
      handlers.onDone?.(full);
    } catch (err) {
      if (isAbort(err)) return;
      try {
        const full = await this.complete(req);
        handlers.onText(full);
        handlers.onDone?.(full);
      } catch (err2) {
        handlers.onError?.(err2 instanceof Error ? err2 : new ProviderError(String(err2)));
      }
    }
  }

  async complete(req: CompletionRequest): Promise<string> {
    const res = await requestUrl({ url: API_URL, method: "POST", headers: this.headers(), body: this.body(req, false), throw: false });
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(extractApiError(res.text, res.status), res.status);
    }
    const data = res.json as { content?: Array<{ type: string; text?: string }> };
    return (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }

  async test(): Promise<ProviderStatus> {
    if (!this.hasCredentials()) return { ok: false, detail: "No API key set." };
    try {
      // Minimal 1-token ping using the cheapest path.
      const res = await requestUrl({
        url: API_URL,
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ model: PING_MODEL, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
        throw: false,
      });
      if (res.status >= 200 && res.status < 300) return { ok: true, detail: "Connected — API key works." };
      return { ok: false, detail: extractApiError(res.text, res.status) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}
