import { Notice } from "obsidian";
import { arrayBufferToBase64, maxBytesFor, sniffMime, type MediaAttachment } from "../../context/attachments";
import { quickNotice } from "../../notice";

export interface PastedImageHost {
  signal?: AbortSignal;
  media(): MediaAttachment[];
  changed(): void;
}

const cancelled = new WeakSet<MediaAttachment>();
/** Explicit removal/reset cancels preparation without affecting another draft. */
export function cancelPastedImages(media: readonly MediaAttachment[]): void {
  for (const item of media) if (item.pending) { cancelled.add(item); delete item.pending; }
}

/** A source item owns preparation, so shallow draft snapshots keep its result. */
export async function attachPastedImage(file: File, host: PastedImageHost): Promise<void> {
  if (host.signal?.aborted) return;
  if (file.size > maxBytesFor("image")) {
    new Notice(`Pasted image is too large to attach (max ${Math.round(maxBytesFor("image") / 1024 / 1024)} MB).`);
    return;
  }
  const item: MediaAttachment = { label: file.name || `Pasted image ${host.media().filter(m => !m.path).length + 1}`, kind: "image", mime: file.type || "image/png", pending: true };
  host.media().push(item);
  host.changed();
  try {
    const buf = await file.arrayBuffer();
    if (cancelled.has(item) || host.signal?.aborted) return;
    if (buf.byteLength > maxBytesFor("image")) throw new Error("The pasted image exceeds the attachment size limit.");
    item.mime = sniffMime(buf) ?? item.mime;
    item.data = arrayBufferToBase64(buf);
    if (host.media().includes(item)) quickNotice("Image attached to your next message.");
  } catch (error) {
    if (cancelled.has(item) || host.signal?.aborted) return;
    item.error = error instanceof Error ? error.message : String(error);
    if (host.media().includes(item)) new Notice(`Couldn't attach the pasted image: ${item.error}`);
  } finally {
    delete item.pending;
    if (!host.signal?.aborted) host.changed();
  }
}

/** Preparation follows source objects across per-conversation draft snapshots. */
export class PastedImagePreparation {
  private readonly lifetime = new AbortController();
  constructor(private readonly current: () => MediaAttachment[]) {}

  get pending(): boolean { return this.current().some(item => item.pending); }

  ready(): boolean {
    if (!this.pending) return true;
    new Notice("Request not sent. An image is still attaching. Wait for it to finish, then send again.");
    return false;
  }

  dispose(): void { this.lifetime.abort(); }

  async attach(file: File, host: PastedImageHost): Promise<void> { await attachPastedImage(file, { ...host, signal: this.lifetime.signal }); }
}
