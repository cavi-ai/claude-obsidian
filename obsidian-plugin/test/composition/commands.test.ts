import { describe, expect, it, vi, type Mock } from "vitest";
import { MarkdownView, Platform, TFile } from "obsidian";
import { buildCommandActions, type CommandActionsHost } from "../../src/composition/commands";
import type { CommandActions } from "../../src/commands/definitions";

const file = new TFile("notes/a.md", "", 0);
const editor = { id: "editor" } as never;
const view = new MarkdownView();

interface Rig { host: CommandActionsHost; actions: CommandActions; mocks: Record<string, Mock> }

function rig(): Rig {
  const mocks: Record<string, Mock> = {};
  const fn = (name: string, impl?: (...args: unknown[]) => unknown): Mock => (mocks[name] = vi.fn(impl));
  const group = (prefix: string, names: string[]): Record<string, Mock> =>
    Object.fromEntries(names.map((n) => [n, fn(`${prefix}.${n}`)]));
  const flat = (names: string[]): Record<string, Mock> => Object.fromEntries(names.map((n) => [n, fn(n)]));

  const semantic = group("semantic", ["rebuildSemanticIndex", "showSemanticIndexStatus"]);
  const memory = group("memory", ["openSessionPicker", "consolidateMemory"]);
  const enrichment = group("enrichment", ["runEnrich"]);
  const optimize = group("optimize", ["reviewTagMerges", "reviewOrphanLinks", "reviewUntypedNotes"]);
  const publish = group("publish", ["publishNote", "copyLink", "unpublish"]);
  const clearChat = fn("view.clearChat");
  const host = {
    app: { workspace: { getActiveViewOfType: fn("workspace.getActiveViewOfType", () => ({ file })) } },
    settings: { sourceCaptureEnabled: true, ontologyEnabled: true },
    lastMarkdownFile: file,
    published: [{ key: "notes/a.md" }],
    conversations: () => ({ getActive: fn("conversations.getActive", () => ({ id: "c" })) }),
    activateView: fn("activateView", async () => ({ clearChat })),
    semantic: () => semantic,
    memory: () => memory,
    enrichment: () => enrichment,
    optimize: () => optimize,
    publish: () => publish,
    ...flat([
      "openNewChatTab", "generatePlanFromNote", "generateArtifactFromContext", "startInlineEdit", "enrichNoteFlow",
      "enableVaultSearch", "activateRelatedView", "activateResearchDesk", "triageClippingsWithPicker",
      "startResearchFromActiveNote", "browseConversations", "deleteActiveConversation", "handoffToBuild", "markNoteAsPlan",
      "organizeClippings", "dispatchCloudSession", "pullCloudReplies", "reviewLinkSuggestions", "openWorkflowPicker",
      "suggestFrontmatterForActiveNote", "createPromptTemplate", "createStandingOrder", "pickStandingOrder",
      "activateMemoryView", "activateInboxView", "activateSystem", "exportClipperTemplates", "seedOntology", "openSetupWizard",
    ]),
  } as unknown as CommandActionsHost;
  return { host, actions: buildCommandActions(host), mocks };
}

const ignore = new Set(["workspace.getActiveViewOfType", "conversations.getActive"]);

type Row = [key: keyof CommandActions, args: unknown[], expected: Array<[mock: string, args?: unknown[]]>];

const ROWS: Row[] = [
  ["openChat", [], [["activateView", []]]],
  ["newChat", [], [["activateView", []], ["view.clearChat", []]]],
  ["newChatTab", [], [["openNewChatTab", []]]],
  ["generatePlanFromNote", [], [["generatePlanFromNote", []]]],
  ["generateArtifactFromContext", [], [["generateArtifactFromContext", []]]],
  ["editWithClaude", [editor, view], [["startInlineEdit", [editor, view]]]],
  ["enrichNote", [file], [["enrichNoteFlow", [file]]]],
  ["enableVaultSearch", [], [["enableVaultSearch", []]]],
  ["rebuildSemanticIndex", [], [["semantic.rebuildSemanticIndex", []]]],
  ["openRelatedNotes", [], [["activateRelatedView", []]]],
  ["openResearchDesk", [], [["activateResearchDesk", []]]],
  ["triageClippings", [], [["triageClippingsWithPicker", []]]],
  ["startResearchFromActiveNote", [], [["startResearchFromActiveNote", []]]],
  ["showSemanticIndexStatus", [], [["semantic.showSemanticIndexStatus", []]]],
  ["browseConversations", [], [["browseConversations", []]]],
  ["deleteActiveConversation", [], [["deleteActiveConversation", []]]],
  ["handoffToBuild", [], [["handoffToBuild", []]]],
  ["markNoteAsPlan", [file], [["markNoteAsPlan", [file]]]],
  ["organizeClippings", [], [["organizeClippings", []]]],
  ["dispatchCloudSession", [], [["dispatchCloudSession", []]]],
  ["pullCloudReplies", [], [["pullCloudReplies", []]]],
  ["reviewLinkSuggestions", [], [["reviewLinkSuggestions", []]]],
  ["openWorkflowPicker", [], [["openWorkflowPicker", []]]],
  ["suggestFrontmatterForActiveNote", [], [["suggestFrontmatterForActiveNote", []]]],
  ["createPromptTemplate", [], [["createPromptTemplate", []]]],
  ["createStandingOrder", [], [["createStandingOrder", []]]],
  ["runStandingOrder", [], [["pickStandingOrder", []]]],
  ["openSessionPicker", [], [["memory.openSessionPicker", []]]],
  ["openMemoryView", [], [["activateMemoryView", []]]],
  ["consolidateMemory", [], [["memory.consolidateMemory", []]]],
  ["enrichNoteAsSource", [file], [["enrichment.runEnrich", [file]]]],
  ["openSourceInbox", [], [["activateInboxView", []]]],
  ["openSystem", [], [["activateSystem", []]]],
  ["exportClipperTemplates", [], [["exportClipperTemplates", []]]],
  ["seedOntology", [], [["seedOntology", []]]],
  ["optimizeBrain", [], [["optimize.reviewTagMerges", [expect.any(Function)]]]],
  ["optimizeLinks", [], [["optimize.reviewOrphanLinks", [expect.any(Function)]]]],
  ["optimizeTypes", [], [["optimize.reviewUntypedNotes", [expect.any(Function)]]]],
  ["openSetupWizard", [], [["openSetupWizard", []]]],
  ["publishNote", [file], [["publish.publishNote", [file.path]]]],
  ["copyPublishedLink", [file], [["publish.copyLink", [file.path]]]],
  ["unpublishNote", [file], [["publish.unpublish", [file.path]]]],
];

const VALUE_KEYS = ["activeMarkdownFile", "lastMarkdownFile", "hasActiveConversation", "sourceCaptureEnabled", "ontologyEnabled", "desktop", "isPublished"];

describe("buildCommandActions", () => {
  it("covers every CommandActions key exactly once", () => {
    const { actions } = rig();
    const covered = [...ROWS.map(([key]) => key as string), ...VALUE_KEYS].sort();
    expect(covered).toEqual(Object.keys(actions).sort());
  });

  it.each(ROWS)("%s calls exactly its host member", async (key, args, expected) => {
    const { actions, mocks } = rig();
    await (actions[key] as (...a: unknown[]) => unknown)(...args);
    await Promise.resolve();
    await Promise.resolve();
    const called = Object.keys(mocks).filter((name) => !ignore.has(name) && mocks[name]!.mock.calls.length > 0).sort();
    expect(called).toEqual(expected.map(([name]) => name).sort());
    for (const [name, expectedArgs] of expected) {
      expect(mocks[name]).toHaveBeenCalledTimes(1);
      expect(mocks[name]).toHaveBeenCalledWith(...(expectedArgs ?? []));
    }
  });

  it("reads the active file through the markdown view lookup", () => {
    const { actions, mocks } = rig();
    expect(actions.activeMarkdownFile()).toBe(file);
    expect(mocks["workspace.getActiveViewOfType"]).toHaveBeenCalledWith(MarkdownView);
  });

  it("answers state queries from the host", () => {
    const { actions, host } = rig();
    expect(actions.lastMarkdownFile()).toBe(file);
    expect(actions.hasActiveConversation()).toBe(true);
    expect(actions.sourceCaptureEnabled()).toBe(true);
    expect(actions.ontologyEnabled()).toBe(true);
    expect(actions.desktop).toBe(!Platform.isMobile);
    expect(actions.isPublished(file)).toBe(true);
    expect(actions.isPublished(new TFile("other.md", "", 0))).toBe(false);
    expect(host.published).toHaveLength(1);
  });

  it("returns the promise from flows the command layer awaits", async () => {
    const { actions, mocks } = rig();
    mocks["handoffToBuild"]!.mockResolvedValue("done");
    await expect(actions.handoffToBuild()).resolves.toBe("done");
  });
});
