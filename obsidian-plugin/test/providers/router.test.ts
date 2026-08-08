import { describe, it, expect, vi } from "vitest";
import { ProviderRouter, migrateUtilityBackend } from "../../src/providers/router";
import { DEFAULT_SETTINGS, type PluginSettings } from "../../src/types";

function settings(overrides: Partial<PluginSettings>): PluginSettings {
  return { ...DEFAULT_SETTINGS, apiKey: "sk-ant-api-test", ...overrides };
}

describe("ProviderRouter.resolve", () => {
  it("routes utility to claude by default", () => {
    const r = new ProviderRouter(settings({}));
    expect(r.resolve("utility").provider.id).toBe("anthropic");
  });

  it("routes utility to ollama with the chat model when no utility model is set", () => {
    const r = new ProviderRouter(settings({ utilityBackend: "ollama", ollamaModel: "qwen2.5" }));
    const res = r.resolve("utility");
    expect(res.provider.id).toBe("ollama");
    expect(res.model).toBe("qwen2.5");
  });

  it("splits utility onto its own smaller model when configured", () => {
    const r = new ProviderRouter(settings({ utilityBackend: "ollama", ollamaModel: "qwen2.5", ollamaUtilityModel: "qwen2.5:1.5b" }));
    const res = r.resolve("utility");
    expect(res.model).toBe("qwen2.5:1.5b");
    // …while local chat keeps the chat model.
    const chat = new ProviderRouter(settings({ chatBackend: "local", ollamaModel: "qwen2.5", ollamaUtilityModel: "qwen2.5:1.5b" }));
    expect(chat.resolve("chat").model).toBe("qwen2.5");
  });

  it("routes utility to the custom endpoint when configured", () => {
    const r = new ProviderRouter(settings({ utilityBackend: "custom", openaiCompatHost: "http://localhost:1234", openaiCompatModel: "mlx-3b" }));
    const res = r.resolve("utility");
    expect(res.provider.id).toBe("openai-compat");
    expect(res.model).toBe("mlx-3b");
  });

  it("keeps the configured custom utility backend when its host is missing", () => {
    const r = new ProviderRouter(settings({ utilityBackend: "custom", openaiCompatHost: "" }));
    expect(r.resolve("utility").provider.id).toBe("openai-compat");
  });

  it("routes chat to the custom endpoint when the backend is custom", () => {
    const r = new ProviderRouter(settings({ chatBackend: "custom", openaiCompatHost: "http://localhost:1234", openaiCompatModel: "mlx-3b" }));
    const res = r.resolve("chat");
    expect(res.provider.id).toBe("openai-compat");
    expect(res.model).toBe("mlx-3b");
  });

  it("falls back to claude chat when the custom endpoint is unconfigured", () => {
    const r = new ProviderRouter(settings({ chatBackend: "custom", openaiCompatHost: "" }));
    expect(r.resolve("chat").provider.id).toBe("anthropic");
  });

  it("get() returns each provider by id", () => {
    const r = new ProviderRouter(settings({}));
    expect(r.get("anthropic").id).toBe("anthropic");
    expect(r.get("ollama").id).toBe("ollama");
    expect(r.get("openai-compat").id).toBe("openai-compat");
  });
});

describe("ProviderRouter.resolveUtilityForRuntime", () => {
  it("does not return a callable provider for a mobile loopback endpoint before consent", () => {
    const configured = settings({ utilityBackend: "ollama", ollamaHost: "http://localhost:11434" });
    const r = new ProviderRouter(configured);

    expect(r.resolveUtilityForRuntime({ isMobile: true })).toEqual({
      state: "unavailable-loopback",
      backend: "ollama",
      endpoint: "http://localhost:11434",
    });
    expect(configured.utilityBackend).toBe("ollama");
  });

  it("selects a non-loopback configured endpoint on mobile", () => {
    const r = new ProviderRouter(settings({
      utilityBackend: "custom",
      openaiCompatHost: "http://192.168.1.24:1234",
      openaiCompatModel: "mlx-3b",
    }));

    const result = r.resolveUtilityForRuntime({ isMobile: true });
    expect(result.state).toBe("configured-provider");
    if (result.state !== "configured-provider") throw new Error("expected a configured provider");
    expect(result.provider.id).toBe("openai-compat");
    expect(result.model).toBe("mlx-3b");
  });

  it("selects Claude only when the session approved mobile loopback fallback", () => {
    const r = new ProviderRouter(settings({
      utilityBackend: "ollama",
      ollamaHost: "http://127.0.0.1:11434",
      model: "claude-sonnet-5-20260203",
    }));

    const result = r.resolveUtilityForRuntime({ isMobile: true, fallbackApproval: "allow" });
    expect(result.state).toBe("approved-Claude-fallback");
    if (result.state !== "approved-Claude-fallback") throw new Error("expected an approved fallback");
    expect(result.provider.id).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-5-20260203");
  });
});

describe("ProviderRouter.completeResolved", () => {
  it("completes with the provider and model selected before enrichment", async () => {
    const r = new ProviderRouter(settings({ utilityBackend: "ollama", ollamaUtilityModel: "qwen3:1.7b" }));
    const selected = r.resolve("utility");
    const complete = vi.spyOn(selected.provider, "complete").mockResolvedValue("{}");

    const result = await r.completeResolved(selected, { system: "sys", user: "note" });

    expect(result.provider).toBe(selected.provider);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ model: "qwen3:1.7b" }));
  });
});

describe("ProviderRouter.localFallback", () => {
  it("prefers Ollama when reachable", async () => {
    const r = new ProviderRouter(settings({ ollamaModel: "qwen2.5" }));
    vi.spyOn(r.ollama, "listModels").mockResolvedValue(["qwen2.5"]);
    const fb = await r.localFallback();
    expect(fb?.provider.id).toBe("ollama");
    expect(fb?.model).toBe("qwen2.5");
    await expect(r.localAvailable()).resolves.toBe(true);
  });

  it("falls through to the custom endpoint when Ollama is down", async () => {
    const r = new ProviderRouter(settings({ openaiCompatHost: "http://localhost:1234", openaiCompatModel: "mlx-3b" }));
    vi.spyOn(r.ollama, "listModels").mockResolvedValue([]);
    vi.spyOn(r.openaiCompat, "listModels").mockResolvedValue(["mlx-3b"]);
    const fb = await r.localFallback();
    expect(fb?.provider.id).toBe("openai-compat");
    expect(fb?.model).toBe("mlx-3b");
  });

  it("null when neither backend is usable", async () => {
    const r = new ProviderRouter(settings({}));
    vi.spyOn(r.ollama, "listModels").mockResolvedValue([]);
    await expect(r.localFallback()).resolves.toBeNull();
    await expect(r.localAvailable()).resolves.toBe(false);
  });

  it("never treats an unmodeled custom endpoint as a fallback", async () => {
    const r = new ProviderRouter(settings({ openaiCompatHost: "http://localhost:1234", openaiCompatModel: "" }));
    vi.spyOn(r.ollama, "listModels").mockResolvedValue([]);
    await expect(r.localFallback()).resolves.toBeNull();
  });
});

describe("migrateUtilityBackend", () => {
  it("maps a persisted localUtilityEnabled=true to ollama", () => {
    expect(migrateUtilityBackend({ localUtilityEnabled: true })).toBe("ollama");
  });
  it("undefined for users who never opted in — the claude default applies", () => {
    expect(migrateUtilityBackend({ localUtilityEnabled: false })).toBeUndefined();
    expect(migrateUtilityBackend({})).toBeUndefined();
    expect(migrateUtilityBackend(null)).toBeUndefined();
  });
  it("undefined once utilityBackend is stored — respect the new key", () => {
    expect(migrateUtilityBackend({ utilityBackend: "custom", localUtilityEnabled: true })).toBeUndefined();
  });
});
