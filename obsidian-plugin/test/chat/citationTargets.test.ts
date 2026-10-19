import { expect, it } from "vitest";
import { ActivityStore } from "../../src/activity/store";
import { ConversationsController } from "../../src/conversations/controller";
import { emptyState, fromPersisted } from "../../src/conversations/store";
import { DEFAULT_SETTINGS, type ChatMessage } from "../../src/types";

it.each(["complete", "cap", "interrupt"] as const)("retains resolved citation targets across %s, moves, and persistence", async outcome => {
  let state = emptyState();
  const controller = new ConversationsController({
    state: { get: () => state, set: value => { state = value; } },
    persist: async () => undefined,
    settings: () => DEFAULT_SETTINGS,
    activity: () => new ActivityStore(),
    resolveCitation: link => link === "Alpha" ? "Notes/Alpha.md" : null,
  });
  const messages: ChatMessage[] = [{ role: "user", content: "When?" }, { role: "assistant", content: "In March [[Alpha#Findings]], unlike [[Ghost]]." }];
  const turn = await controller.beginTurn(null, messages.slice(0, 1), { backend: "claude", model: "m", mode: "ask" });
  if (outcome === "complete") await controller.completeTurn(turn.conversationId, turn.turnId, messages);
  if (outcome === "cap") await controller.capTurn(turn.conversationId, turn.turnId, messages);
  if (outcome === "interrupt") await controller.interruptTurn(turn.conversationId, turn.turnId, messages);
  expect(controller.list()[0]?.messages[1]?.citationTargets).toEqual([
    { linkpath: "Alpha", heading: "Findings", path: "Notes/Alpha.md" },
    { linkpath: "Ghost", heading: null, path: null },
  ]);
  await controller.startNew();
  await controller.renameAttachments("Notes/Alpha.md", "Notes/Migration.md");
  await controller.renameAttachments("Notes", "Archive");
  expect(state.activeId).toBeNull();
  const reopened = fromPersisted(JSON.parse(JSON.stringify(state)));
  expect(reopened.conversations[0]?.messages[1]?.citationTargets?.[0]?.path).toBe("Archive/Migration.md");
  expect(reopened.conversations[0]?.messages[1]?.content).toBe(messages[1]!.content);
  const nextMessages: ChatMessage[] = [...messages, { role: "user", content: "Explain more" }];
  const next = await controller.beginTurn(turn.conversationId, nextMessages, { backend: "claude", model: "m", mode: "ask" });
  await controller.completeTurn(next.conversationId, next.turnId, [...nextMessages, { role: "assistant", content: "More details" }]);
  expect(controller.list()[0]?.messages[1]?.citationTargets?.[0]?.path).toBe("Archive/Migration.md");
});
