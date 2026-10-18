import { Notice, type App } from "obsidian";
import { maxBytesFor, sniffMime, type MediaAttachment } from "../../context/attachments";
import { quickNotice } from "../../notice";

export interface PastedImageHost {
  app: Pick<App, "fileManager" | "vault">;
  sourcePath?: string | undefined;
  media(): MediaAttachment[];
  changed(): void;
}

const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

/** Store pasted bytes in the configured attachment folder; resets invalidate old reads. */
export async function attachPastedImage(file: File, host: PastedImageHost): Promise<void> {
  const limit = maxBytesFor("image");
  if (file.size > limit) {
    new Notice(`Pasted image is too large to attach (max ${Math.round(limit / 1024 / 1024)} MB).`);
    return;
  }
  const media = host.media();
  try {
    const buf = await file.arrayBuffer();
    if (media !== host.media()) return;
    if (buf.byteLength > limit) throw new Error("The pasted image exceeds the attachment size limit.");
    const mime = sniffMime(buf) ?? (file.type || "image/png");
    const extension = EXTENSION[mime];
    if (!extension) throw new Error("Use a PNG, JPEG, GIF, or WebP image.");
    const name = (file.name.split(/[\\/]/).pop() || "Pasted image").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\p{Cc}]/gu, " ").trim() || "Pasted image";
    for (let attempt = 0; attempt < 3; attempt++) {
      const path = await host.app.fileManager.getAvailablePathForAttachment(`${name}.${extension}`, host.sourcePath);
      if (media !== host.media()) return;
      try {
        await host.app.vault.createBinary(path, buf);
      } catch (error) {
        // Another paste can claim an available name before createBinary runs.
        if (attempt < 2 && host.app.vault.getAbstractFileByPath(path)) continue;
        throw error;
      }
      if (media !== host.media()) return;
      media.push({ label: path.split("/").pop() || name, kind: "image", mime, path });
      host.changed();
      quickNotice("Image saved to your vault and attached to your next message.");
      return;
    }
  } catch (error) {
    if (media === host.media()) new Notice(`Couldn't attach the pasted image: ${error instanceof Error ? error.message : String(error)}`);
  }
}
