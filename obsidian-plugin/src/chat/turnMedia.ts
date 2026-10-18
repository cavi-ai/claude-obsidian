import type { MediaAttachment } from "../context/attachments";
import type { ChatMessage } from "../types";

/** Durable metadata only; pasted bytes stay in memory while their message is live. */
export type TurnMediaReference = Omit<MediaAttachment, "data">;
const payloads = new WeakMap<TurnMediaReference[], MediaAttachment[]>();

export function rememberTurnMedia(media: readonly MediaAttachment[]): TurnMediaReference[] {
  const refs = media.map(({ label, kind, mime, path }) => ({ label, kind, mime, ...(path ? { path } : {}) }));
  payloads.set(refs, [...media]);
  return refs;
}

/** Resolve the last accepted question, independently of the next question's composer. */
export function readTurnMedia(messages: readonly ChatMessage[]): MediaAttachment[] {
  const refs = [...messages].reverse().find((message) => message.role === "user")?.media;
  if (refs === undefined) return [];
  if (!Array.isArray(refs)) throw new Error("Original attachments are invalid. Reattach them and resend the question.");
  for (const ref of refs) {
    if (!ref || (ref.kind !== "image" && ref.kind !== "pdf") || typeof ref.label !== "string" || typeof ref.mime !== "string" || (ref.path !== undefined && (typeof ref.path !== "string" || !ref.path))) {
      throw new Error("Original attachments are invalid. Reattach them and resend the question.");
    }
  }
  let media = payloads.get(refs);
  if (!media) {
    media = refs.map(({ label, kind, mime, path }) => {
      if (!path) throw new Error(`Original attachment ${label} is no longer available. Paste it again and resend the question.`);
      return { label, kind, mime, path };
    });
    payloads.set(refs, media);
  }
  return [...media];
}
