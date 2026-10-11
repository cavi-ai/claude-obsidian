import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { ActivityStore } from "../src/activity/store";
import { ConversationsController } from "../src/conversations/controller";
import { SessionActions } from "../src/conversations/sessionActions";
import ClaudeCompanionPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types";

const FORWARDERS = [
  "listConversations", "getActiveConversation", "beginActiveConversationTurn", "registerActiveChatTurn", "stopActiveChatTurn",
  "saveChatEditProposal", "clearChatEditProposal", "completeActiveConversationTurn", "interruptActiveConversationTurn",
  "capActiveConversationTurn", "activeConversationId", "setActiveConversation", "startNewConversation", "setChatProject",
  "deleteConversation", "renameConversation", "unarchiveConversation", "distillConversation", "archiveConversation",
  "forkConversation", "forkFromSummary",
];

function builtPlugin(): ClaudeCompanionPlugin {
  const plugin = Object.create(ClaudeCompanionPlugin.prototype) as ClaudeCompanionPlugin;
  Object.assign(plugin as unknown as Record<string, unknown>, {
    app: new App(),
    settings: structuredClone(DEFAULT_SETTINGS),
    convState: { conversations: [], activeId: null },
    _activity: new ActivityStore({ successRetentionMs: 60_000 }),
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

  it.each(FORWARDERS)("has no %s forwarder", (name) => {
    expect(name in ClaudeCompanionPlugin.prototype).toBe(false);
  });
});
