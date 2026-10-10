import { App, FakeElement, Platform } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerDeps } from "../../src/view/chat/Composer";
import { DEFAULT_SETTINGS } from "../../src/types";
import { defaultChatControls } from "../../src/claude/chatControls";
import type ClaudeCompanionPlugin from "../../src/main";

function mountComposer(): { root: FakeElement; composer: Composer } {
  const plugin = {
    settings: structuredClone(DEFAULT_SETTINGS),
    router: () => ({
      ollama: { listModels: async () => [] },
      openaiCompat: { listModels: async () => [] },
      chatCapabilities: () => ({ agentActions: true, claudeControls: false, metered: false, local: false, cli: false }),
    }),
  } as unknown as ClaudeCompanionPlugin;
  const deps = {
    applyMode: vi.fn(async () => undefined),
    currentMode: () => "ask",
    updateModeControl: vi.fn(),
    refreshCapabilityIndicators: vi.fn(),
    registerDomEvent: vi.fn(),
    mountUsage: (parent: HTMLElement) => { parent.createDiv({ cls: "cc-usage" }); },
    controls: () => defaultChatControls(DEFAULT_SETTINGS.model),
    onSend: vi.fn(),
  } as unknown as ComposerDeps;
  const composer = new Composer(new App() as never, plugin, deps);
  const root = new FakeElement();
  composer.mount(root as unknown as HTMLElement, []);
  return { root, composer };
}

function classesOf(children: FakeElement[]): string[] {
  return children.map((child) => [...child.classList][0] ?? child.tagName);
}

describe("Composer layout", () => {
  afterEach(() => {
    Platform.isMobile = false;
  });

  it("keeps the mobile input and Send in one input row under the context manager", () => {
    Platform.isMobile = true;
    const { root, composer } = mountComposer();

    const composerEl = root.querySelector(".cc-composer")!;
    expect(classesOf(composerEl.children)[0]).toBe("cc-context-manager");
    const row = composerEl.querySelector(".cc-composer-input-row")!;
    expect(row.children).toEqual([composer.inputEl, composer.sendBtn]);
    expect([...composer.sendBtn.classList]).toContain("cc-send-icon");
    expect(root.querySelector(".cc-composer-card")).toBeNull();
    expect(root.querySelector(".cc-composer-toolbar")).toBeNull();
  });

  it("keeps the desktop layout: context manager first, Send in the composer bar", () => {
    const { root, composer } = mountComposer();

    const composerEl = root.querySelector(".cc-composer")!;
    expect(classesOf(composerEl.children)[0]).toBe("cc-context-manager");
    expect(root.querySelector(".cc-composer-input-row")).toBeNull();
    expect(root.querySelector(".cc-send-group")!.querySelector(".cc-send")).toBe(composer.sendBtn as unknown as FakeElement);
  });
});
