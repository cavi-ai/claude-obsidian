import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { ActivityStore } from "../src/activity/store";
import { ConversationsController } from "../src/conversations/controller";
import { SessionActions } from "../src/conversations/sessionActions";
import ClaudeCompanionPlugin from "../src/main";
import { SemanticController } from "../src/semantic/controller";
import { DEFAULT_SETTINGS } from "../src/types";

const FORWARDERS = [
  "listConversations", "getActiveConversation", "beginActiveConversationTurn", "registerActiveChatTurn", "stopActiveChatTurn",
  "saveChatEditProposal", "clearChatEditProposal", "completeActiveConversationTurn", "interruptActiveConversationTurn",
  "capActiveConversationTurn", "activeConversationId", "setActiveConversation", "startNewConversation", "setChatProject",
  "deleteConversation", "renameConversation", "unarchiveConversation", "distillConversation", "archiveConversation",
  "forkConversation", "forkFromSummary",
  "embeddingRecovery", "builtinEmbedder", "builtinModelCached", "clearBuiltinModel", "indexer", "promptSemanticModelIfNeeded",
  "downloadBuiltinModelAndIndex", "invalidateIndexer", "semanticSearch", "relatedNotes", "relatedForTools",
  "rebuildSemanticIndex", "showSemanticIndexStatus", "queueReindex", "suspendReindex", "canEmbedWithoutDownload",
];

function builtPlugin(): ClaudeCompanionPlugin {
  const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  Object.assign(plugin as unknown as Record<string, unknown>, {
    app: new App(),
    settings: structuredClone(DEFAULT_SETTINGS),
    convState: { conversations: [], activeId: null },
    _activity: new ActivityStore({ successRetentionMs: 60_000 }),
    manifest: { id: "claude-companion", dir: ".obsidian/plugins/claude-companion" },
    saveData: async () => {},
  });
  return plugin;
}

describe("plugin conversation surface", () => {
  it("builds the conversation and session controllers", () => {
    const plugin = builtPlugin();
    expect(plugin.conversations()).toBeInstanceOf(ConversationsController);
    expect(plugin.sessionActions()).toBeInstanceOf(SessionActions);
  });

  it("returns the same controller on every call", () => {
    const plugin = builtPlugin();
    expect(plugin.conversations()).toBe(plugin.conversations());
    expect(plugin.sessionActions()).toBe(plugin.sessionActions());
  });

  it("builds one semantic controller", () => {
    const plugin = builtPlugin();
    expect(plugin.semantic()).toBeInstanceOf(SemanticController);
    expect(plugin.semantic()).toBe(plugin.semantic());
  });

  it.each(FORWARDERS)("has no %s forwarder", (name) => {
    expect(name in ClaudeCompanionPlugin.prototype).toBe(false);
  });
});
