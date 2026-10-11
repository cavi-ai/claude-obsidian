import { describe, expect, it } from "vitest";
import ClaudeCompanionPlugin from "../src/main";

const FORWARDERS = [
  "listConversations", "getActiveConversation", "beginActiveConversationTurn", "registerActiveChatTurn", "stopActiveChatTurn",
  "saveChatEditProposal", "clearChatEditProposal", "completeActiveConversationTurn", "interruptActiveConversationTurn",
  "capActiveConversationTurn", "activeConversationId", "setActiveConversation", "startNewConversation", "setChatProject",
  "deleteConversation", "renameConversation", "unarchiveConversation", "distillConversation", "archiveConversation",
  "forkConversation", "forkFromSummary",
];

describe("plugin conversation surface", () => {
  it("exposes the conversation and session controllers", () => {
    const proto = ClaudeCompanionPlugin.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.conversations).toBe("function");
    expect(typeof proto.sessionActions).toBe("function");
  });

  it.each(FORWARDERS)("has no %s forwarder", (name) => {
    expect(name in ClaudeCompanionPlugin.prototype).toBe(false);
  });
});
