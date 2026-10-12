// Maps each command-palette action onto the plugin member that performs it.

import { MarkdownView, Platform } from "obsidian";
import type { CommandActions } from "../commands/definitions";
import type ClaudeCompanionPlugin from "../main";

export type CommandActionsHost = Pick<
  ClaudeCompanionPlugin,
  | "activateInboxView" | "activateMemoryView" | "activateRelatedView" | "activateResearchDesk" | "activateSystem" | "activateView"
  | "app" | "browseConversations" | "conversations" | "createPromptTemplate" | "createStandingOrder" | "deleteActiveConversation"
  | "dispatchCloudSession" | "enableVaultSearch" | "enrichment" | "enrichNoteFlow" | "exportClipperTemplates" | "generateArtifactFromContext"
  | "generatePlanFromNote" | "handoffToBuild" | "lastMarkdownFile" | "markNoteAsPlan" | "memory"
  | "openNewChatTab" | "openSetupWizard" | "openWorkflowPicker" | "optimize" | "organizeClippings" | "pickStandingOrder" | "published"
  | "publish" | "pullCloudReplies" | "reviewLinkSuggestions" | "seedOntology" | "semantic" | "settings" | "startInlineEdit"
  | "startResearchFromActiveNote" | "suggestFrontmatterForActiveNote" | "triageClippingsWithPicker"
>;

export function buildCommandActions(host: CommandActionsHost): CommandActions {
  return {
    activeMarkdownFile: () => host.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null,
    lastMarkdownFile: () => host.lastMarkdownFile ?? null,
    hasActiveConversation: () => !!host.conversations().getActive(),
    sourceCaptureEnabled: () => host.settings.sourceCaptureEnabled,
    ontologyEnabled: () => host.settings.ontologyEnabled,
    desktop: !Platform.isMobile,

    openChat: () => void host.activateView(),
    newChat: () => void host.activateView().then((view) => view?.clearChat()),
    newChatTab: () => void host.openNewChatTab(),
    generatePlanFromNote: () => host.generatePlanFromNote(),
    generateArtifactFromContext: () => host.generateArtifactFromContext(),
    editWithClaude: (editor, view) => void host.startInlineEdit(editor, view),
    enrichNote: (file) => void host.enrichNoteFlow(file),
    enableVaultSearch: () => void host.enableVaultSearch(),
    rebuildSemanticIndex: () => void host.semantic().rebuildSemanticIndex(),
    openRelatedNotes: () => void host.activateRelatedView(),
    openResearchDesk: () => host.activateResearchDesk(),
    triageClippings: () => void host.triageClippingsWithPicker(),
    startResearchFromActiveNote: () => void host.startResearchFromActiveNote(),
    showSemanticIndexStatus: () => void host.semantic().showSemanticIndexStatus(),
    browseConversations: () => void host.browseConversations(),
    deleteActiveConversation: () => host.deleteActiveConversation(),
    handoffToBuild: () => host.handoffToBuild(),
    markNoteAsPlan: (file) => void host.markNoteAsPlan(file),
    organizeClippings: () => void host.organizeClippings(),
    dispatchCloudSession: () => void host.dispatchCloudSession(),
    pullCloudReplies: () => void host.pullCloudReplies(),
    reviewLinkSuggestions: () => void host.reviewLinkSuggestions(),
    openWorkflowPicker: () => host.openWorkflowPicker(),
    suggestFrontmatterForActiveNote: () => host.suggestFrontmatterForActiveNote(),
    createPromptTemplate: () => void host.createPromptTemplate(),
    createStandingOrder: () => void host.createStandingOrder(),
    runStandingOrder: () => host.pickStandingOrder(),
    openSessionPicker: () => host.memory().openSessionPicker(),
    openMemoryView: () => void host.activateMemoryView(),
    consolidateMemory: () => void host.memory().consolidateMemory(),
    enrichNoteAsSource: (file) => void host.enrichment().runEnrich(file),
    openSourceInbox: () => void host.activateInboxView(),
    openSystem: () => void host.activateSystem(),
    exportClipperTemplates: () => void host.exportClipperTemplates(),
    seedOntology: () => void host.seedOntology(),
    optimizeBrain: () => void host.optimize().reviewTagMerges(() => undefined),
    optimizeLinks: () => void host.optimize().reviewOrphanLinks(() => undefined),
    optimizeTypes: () => void host.optimize().reviewUntypedNotes(() => undefined),
    openSetupWizard: () => host.openSetupWizard(),
    publishNote: (file) => void host.publish().publishNote(file.path),
    copyPublishedLink: (file) => void host.publish().copyLink(file.path),
    unpublishNote: (file) => void host.publish().unpublish(file.path),
    isPublished: (file) => host.published.some((item) => item.key === file.path),
  };
}
