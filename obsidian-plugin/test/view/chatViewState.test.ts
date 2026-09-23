import { App, FakeElement, WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { defaultChatControls } from "../../src/claude/chatControls";
import type { Conversation } from "../../src/conversations/store";
import type ClaudeCompanionPlugin from "../../src/main";
import { DEFAULT_SETTINGS } from "../../src/types";
import { ChatView } from "../../src/view/ChatView";

const fakeElement = (): HTMLElement => new FakeElement() as unknown as HTMLElement;

/** A minimal plugin stub, shaped like chatRenderLifecycle.test.ts's, plus the
 * conversation-store surface getState/setState/clearChat touch. */
function statePlugin(overrides: Partial<Record<string, unknown>> = {}): ClaudeCompanionPlugin {
  const provider = { id: "anthropic", hasCredentials: () => true };
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    router: () => ({
      chatProvider: () => ({ provider, model: DEFAULT_SETTINGS.model }),
      chatBackend: "claude",
      chatCapabilities: () => ({ agentActions: false, claudeControls: true, metered: true, local: false, cli: false }),
    }),
    composeSystemPrompt: () => "system",
    listConversations: () => [],
    turnService: () => ({ live: () => null }),
    startNewConversation: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as ClaudeCompanionPlugin;
}

/** Seam type for the private fields/methods these tests poke, mirroring the
 * cast pattern chatRenderLifecycle.test.ts and chatActivation.test.ts use. */
interface Seam {
  app: { workspace: { getActiveViewOfType?: () => null; getActiveFile?: () => null } };
  controls: ReturnType<typeof defaultChatControls>;
  messagesEl: HTMLElement;
  sendBtn: HTMLButtonElement;
  usageEl: HTMLElement;
  gaugeFillEl: HTMLElement;
  conversationId: string | null;
  renderMarkdownInto(el: HTMLElement, markdown: string): Promise<void>;
  renderEmptyState(): void;
  getState(): Record<string, unknown>;
  setState(state: unknown, result: unknown): Promise<void>;
  clearChat(): void;
}

function buildView(plugin: ClaudeCompanionPlugin): Seam {
  const view = new ChatView(new WorkspaceLeaf(new App()), plugin);
  const seam = view as unknown as Seam;
  seam.controls = defaultChatControls(DEFAULT_SETTINGS.model);
  seam.messagesEl = fakeElement();
  seam.sendBtn = fakeElement() as unknown as HTMLButtonElement;
  seam.usageEl = fakeElement();
  seam.gaugeFillEl = fakeElement();
  seam.app.workspace.getActiveViewOfType = () => null;
  seam.app.workspace.getActiveFile = () => null;
  seam.renderMarkdownInto = async () => undefined;
  // clearChat's empty-state render pulls in the setup-card/credential chain;
  // that path isn't what this file is about, so it's stubbed to a no-op.
  seam.renderEmptyState = () => undefined;
  return seam;
}

describe("ChatView per-leaf conversation state", () => {
  it("getState/setState round trip: a known id loads that conversation and is reflected back", async () => {
    const conversation: Conversation = { id: "b", title: "Release notes", createdAt: 1, updatedAt: 2, messages: [{ role: "user", content: "hi" }] };
    const seam = buildView(statePlugin({ listConversations: () => [conversation] }));

    await seam.setState({ conversationId: "b" }, {});

    expect(seam.conversationId).toBe("b");
    expect(seam.getState()).toEqual({ conversationId: "b" });
  });

  it("setState with an unknown id keeps the current state", async () => {
    const known: Conversation = { id: "known", title: "T", createdAt: 1, updatedAt: 1, messages: [{ role: "user", content: "hi" }] };
    const seam = buildView(statePlugin({ listConversations: () => [known] }));
    seam.conversationId = "known";

    await seam.setState({ conversationId: "ghost-id" }, {});

    expect(seam.conversationId).toBe("known");
    expect(seam.getState()).toEqual({ conversationId: "known" });
  });

  it("clearChat nulls the conversation id without touching the store's active id", () => {
    const startNewConversation = vi.fn(async () => undefined);
    const seam = buildView(statePlugin({ startNewConversation }));
    seam.conversationId = "existing";

    seam.clearChat();

    expect(seam.conversationId).toBeNull();
    expect(startNewConversation).not.toHaveBeenCalled();
  });

  it("loadConversation calls the leaf's updateHeader when present, so the tab title follows the active conversation", () => {
    const conversation: Conversation = { id: "b", title: "Release notes", createdAt: 1, updatedAt: 2, messages: [{ role: "user", content: "hi" }] };
    const seam = buildView(statePlugin({ listConversations: () => [conversation] }));
    const updateHeader = vi.fn();
    (seam as unknown as { leaf: { updateHeader: () => void } }).leaf.updateHeader = updateHeader;

    (seam as unknown as { loadConversation(c: Conversation): void }).loadConversation(conversation);

    expect(updateHeader).toHaveBeenCalledOnce();
  });
});
