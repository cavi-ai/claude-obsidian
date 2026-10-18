import { Notice } from "obsidian";
import { arrayBufferToBase64, maxBytesFor, sniffMime, type MediaAttachment } from "../../context/attachments";
import { quickNotice } from "../../notice";

export interface PastedImageHost {
  media(): MediaAttachment[];
  changed(): void;
}

/** A reset replaces the media collection, invalidating reads from the old chat. */
export async function attachPastedImage(file: File, host: PastedImageHost): Promise<void> {
  if (file.size > maxBytesFor("image")) {
    new Notice(`Pasted image is too large to attach (max ${Math.round(maxBytesFor("image") / 1024 / 1024)} MB).`);
    return;
  }
  const media = host.media();
  const buf = await file.arrayBuffer();
  if (media !== host.media()) return;
  const data = arrayBufferToBase64(buf);
  const n = media.filter((m) => !m.path).length + 1;
  media.push({ label: file.name || `Pasted image ${n}`, kind: "image", mime: sniffMime(buf) ?? (file.type || "image/png"), data });
  host.changed();
  quickNotice("Image attached to your next message.");
}


/** Tracks only the image reads owned by one draft's media collection. */
export class PastedImagePreparation {
  private readonly counts = new WeakMap<MediaAttachment[], number>();

  constructor(private readonly current: () => MediaAttachment[]) {}

  get pending(): boolean { return (this.counts.get(this.current()) ?? 0) > 0; }

  ready(): boolean {
    if (!this.pending) return true;
    new Notice("Request not sent. An image is still attaching. Wait for it to finish, then send again.");
    return false;
  }

  async attach(file: File, host: PastedImageHost): Promise<void> {
    const media = host.media();
    this.counts.set(media, (this.counts.get(media) ?? 0) + 1);
    try { await attachPastedImage(file, host); }
    catch (error) {
      if (media === host.media()) new Notice(`Couldn't attach the pasted image: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      const remaining = (this.counts.get(media) ?? 1) - 1;
      if (remaining) this.counts.set(media, remaining);
      else this.counts.delete(media);
    }
  }
}
