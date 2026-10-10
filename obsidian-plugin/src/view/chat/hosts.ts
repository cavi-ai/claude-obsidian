// The plugin capabilities each chat module uses; a module typed by its host cannot reach the rest of the plugin.

import type ClaudeCompanionPlugin from "../../main";

export type ComposerHost = Pick<ClaudeCompanionPlugin, "captureWebPage" | "router" | "saveSettings" | "settings">;

export type TranscriptHost = Pick<ClaudeCompanionPlugin, "activateRelatedView" | "activateResearchDesk" | "companionWorkspaceContext" | "handoffToBuild" | "router" | "settings">;

export type SetupCardHost = Pick<ClaudeCompanionPlugin, "continueOnboarding" | "router" | "saveSettings" | "secrets" | "settings">;

export type HeaderHost = Pick<
  ClaudeCompanionPlugin,
  | "activateInboxView" | "activateRelatedView" | "activateResearchDesk" | "archiveConversation" | "companionChrome" | "composeSystemPrompt"
  | "deleteActiveConversation" | "deleteConversation" | "dispatchCloudSession" | "distillConversation" | "forkConversation" | "forkFromSummary"
  | "getActiveConversation" | "listConversations" | "mcpStats" | "openNewChatTab" | "openSessionPicker" | "pullCloudReplies" | "renameConversation"
  | "router" | "saveSettings" | "setActiveConversation" | "setMcpEnabled" | "settings" | "unarchiveConversation"
>;
