import type { MediaAttachment } from "../context/attachments";
import type { ChatMessage } from "../types";

/** Durable metadata only; pasted bytes stay in memory while their message is live. */
export type TurnMediaReference = Omit<MediaAttachment, "data">;
const payloads = new WeakMap<TurnMediaReference[], MediaAttachment[]>();
// In-flight turns can still hold an older immutable message snapshot after a move.
const renamed = new WeakMap<TurnMediaReference[], TurnMediaReference[]>();

export function currentTurnMedia(refs: TurnMediaReference[]): TurnMediaReference[] {
  let next: TurnMediaReference[] | undefined;
  while ((next = renamed.get(refs))) refs = next;
  return refs;
}

export function renameTurnMedia(refs: TurnMediaReference[], oldPath: string, newPath: string): TurnMediaReference[] {
  refs = currentTurnMedia(refs);
  const moved = (path?: string) => typeof path === "string" && (path === oldPath || path.startsWith(`${oldPath}/`));
  if (!refs.some((ref) => ref && moved(ref.path))) return refs;
  const next = refs.map((ref) => {
    if (!ref || !moved(ref.path)) return ref;
    const path = newPath + ref.path!.slice(oldPath.length);
    return { kind: ref.kind, mime: ref.mime, path, label: path.split("/").pop() ?? path };
  });
  const cached = payloads.get(refs);
  if (cached) payloads.set(next, cached.map((item) => {
    if (!moved(item.path)) return item;
    const path = newPath + item.path!.slice(oldPath.length);
    return { ...item, path, label: path.split("/").pop() ?? path };
  }));
  renamed.set(refs, next);
  return next;
}

export function rememberTurnMedia(media: readonly MediaAttachment[]): TurnMediaReference[] {
  const refs = media.map(({ label, kind, mime, path }) => ({ label, kind, mime, ...(path ? { path } : {}) }));
  payloads.set(refs, [...media]);
  return refs;
}

/** Resolve the last accepted question, independently of the next question's composer. */
export function readTurnMedia(messages: readonly ChatMessage[]): MediaAttachment[] {
  const stored = [...messages].reverse().find((message) => message.role === "user")?.media;
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) throw new Error("Original attachments are invalid. Reattach them and resend the question.");
  const refs = currentTurnMedia(stored);
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
