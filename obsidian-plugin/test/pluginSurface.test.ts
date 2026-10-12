import { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { ActivityStore } from "../src/activity/store";
import { ConversationsController } from "../src/conversations/controller";
import { SessionActions } from "../src/conversations/sessionActions";
import ClaudeCompanionPlugin from "../src/main";
import { Onboarding } from "../src/onboarding/onboarding";
import { UtilityRouting } from "../src/providers/utilityRouting";
import { SemanticController } from "../src/semantic/controller";
import { ClipperFeature } from "../src/sources/clipperFeature";
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
  "sourceEnrichmentBackendLabel", "providerErrorHint", "isUtilityLifecycleActive", "assertUtilityLifecycleActive",
  "sourceEnrichmentErrorHint", "resolveUtilitySelectionForSession", "runtimeUtilitySelection", "utilityUnavailableMessage",
  "askMobileUtilityFallback", "exportClipperTemplates", "clipperSetupNeeded", "openClipperSetup", "queueClipperVerification",
  "clipperTemplatesStale", "clipperStatus", "seedOntology", "credentialSetupInputs", "runFirstRun", "continueOnboarding",
  "openSetupWizard", "runFirstRunPrompts", "loadOntologyOnStart", "offerOntologySeed", "offerDesktopIntegrations",
  "scheduleOntologyReload",
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

  it("builds one utility routing, clipper setup and onboarding module", () => {
    const plugin = builtPlugin();
    expect(plugin.utilityRouting()).toBeInstanceOf(UtilityRouting);
    expect(plugin.utilityRouting()).toBe(plugin.utilityRouting());
    expect(plugin.clipperSetup()).toBeInstanceOf(ClipperFeature);
    expect(plugin.clipperSetup()).toBe(plugin.clipperSetup());
    expect(plugin.onboarding()).toBeInstanceOf(Onboarding);
    expect(plugin.onboarding()).toBe(plugin.onboarding());
  });

  it.each(FORWARDERS)("has no %s forwarder", (name) => {
    expect(name in ClaudeCompanionPlugin.prototype).toBe(false);
  });
});
