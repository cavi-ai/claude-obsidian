import type { Composer } from "./Composer";
import { restoreDraftContext } from "./draftContextState";

/** Unsent text in one pane; null owns its unstarted New chat draft. */
export class ConversationDrafts {
  generation = 0;
  private readonly drafts = new Map<string | null, string>();

  constructor(private readonly composer: () => Composer) {}

  switchTo(from: string | null, to: string | null): void {
    this.generation++;
    if (from === to) return;
    const composer = this.composer();
    const text = composer.draft();
    if (text) this.drafts.set(from, text);
    else this.drafts.delete(from);
    this.display(to);
  }

  getState(conversationId: string | null): Record<string, unknown> {
    const drafts = new Map(this.drafts);
    const text = this.composer().draft();
    if (text) drafts.set(conversationId, text);
    else drafts.delete(conversationId);
    return { conversationId, ...(drafts.size ? { drafts: [...drafts].map(([conversationId, text]) => ({ conversationId, text })) } : {}) };
  }

  restore(state: unknown, conversationId: string | null): void {
    const entries = (state as { drafts?: unknown } | null)?.drafts;
    if (Array.isArray(entries)) {
      this.generation++;
      this.drafts.clear();
      for (const entry of entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const { conversationId, text } = entry as Record<string, unknown>;
        if ((conversationId === null || typeof conversationId === "string") && typeof text === "string" && text) this.drafts.set(conversationId, text);
      }
      this.display(conversationId);
    }
    restoreDraftContext(this.composer(), state);
  }

  private display(conversationId: string | null): void {
    const composer = this.composer();
    if (!composer.inputEl) return;
    composer.inputEl.value = this.drafts.get(conversationId) ?? "";
    composer.autosizeInput();
    composer.slashMenu?.hide();
    composer.atMenu?.hide();
    if (composer.pageOfferEl) composer.syncPageOffer();
  }

  /** Consume only the submitted conversation's draft, including a first send. */
  consume(conversationId: string | null): void {
    this.drafts.delete(conversationId);
  }
}
