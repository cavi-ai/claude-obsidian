import { describe, expect, it } from "vitest";
import { classifyEndpoint, resolveUtilityForRuntime } from "../../src/providers/endpointPolicy";

describe("classifyEndpoint", () => {
  it.each([
    ["http://localhost:11434", "loopback"],
    ["http://127.0.0.1:11434", "loopback"],
    ["http://[::1]:11434", "loopback"],
    ["http://0.0.0.0:11434", "wildcard-local"],
    ["http://[::]:11434", "wildcard-local"],
    ["http://192.168.1.24:11434", "lan"],
    ["https://models.example.com", "remote"],
    ["not a url", "invalid"],
  ] as const)("classifies %s as %s", (url, expected) => {
    expect(classifyEndpoint(url)).toBe(expected);
  });
});

describe("resolveUtilityForRuntime", () => {
  it("keeps the configured loopback provider on desktop", () => {
    expect(resolveUtilityForRuntime({
      backend: "ollama",
      endpoint: "http://localhost:11434",
      isMobile: false,
      claudeAvailable: true,
    })).toEqual({ state: "configured-provider", backend: "ollama" });
  });

  it.each([
    ["http://192.168.1.24:11434", "lan"],
    ["https://models.example.com", "remote"],
  ] as const)("keeps a mobile %s endpoint on the configured provider", (endpoint, _classification) => {
    expect(resolveUtilityForRuntime({
      backend: "custom",
      endpoint,
      isMobile: true,
      claudeAvailable: true,
    })).toEqual({ state: "configured-provider", backend: "custom" });
  });

  it("requires approval before mobile can replace a loopback provider with Claude", () => {
    expect(resolveUtilityForRuntime({
      backend: "ollama",
      endpoint: "http://127.0.0.1:11434",
      isMobile: true,
      claudeAvailable: true,
    })).toEqual({
      state: "unavailable-loopback",
      backend: "ollama",
      endpoint: "http://127.0.0.1:11434",
    });
  });

  it("uses Claude only after mobile fallback approval", () => {
    expect(resolveUtilityForRuntime({
      backend: "custom",
      endpoint: "http://localhost:1234",
      isMobile: true,
      claudeAvailable: true,
      fallbackApproval: "allow",
    })).toEqual({
      state: "approved-Claude-fallback",
      backend: "claude",
      configuredBackend: "custom",
      endpoint: "http://localhost:1234",
    });
  });

  it("does not fall back after mobile fallback denial", () => {
    expect(resolveUtilityForRuntime({
      backend: "ollama",
      endpoint: "http://localhost:11434",
      isMobile: true,
      claudeAvailable: true,
      fallbackApproval: "deny",
    })).toEqual({
      state: "unavailable-without-Claude",
      backend: "ollama",
      endpoint: "http://localhost:11434",
      reason: "fallback-denied",
    });
  });

  it("does not offer fallback when Claude has no credential", () => {
    expect(resolveUtilityForRuntime({
      backend: "custom",
      endpoint: "http://localhost:1234",
      isMobile: true,
      claudeAvailable: false,
    })).toEqual({
      state: "unavailable-without-Claude",
      backend: "custom",
      endpoint: "http://localhost:1234",
      reason: "claude-unavailable",
    });
  });

  it("rejects an invalid configured endpoint on mobile without sending to Claude", () => {
    expect(resolveUtilityForRuntime({
      backend: "custom",
      endpoint: "not a url",
      isMobile: true,
      claudeAvailable: true,
    })).toEqual({
      state: "unavailable-without-Claude",
      backend: "custom",
      endpoint: "not a url",
      reason: "invalid-endpoint",
    });
  });
});
