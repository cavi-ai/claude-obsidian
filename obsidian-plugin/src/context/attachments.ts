// Multimodal attachments (spec 2026-07-06): vault PDFs/images (or pasted
// screenshots) attached to a chat turn as Anthropic document/image content
// blocks. Pure — binary data arrives as ArrayBuffer/base64 from the caller.

import type { ContentBlock } from "../providers/types";

export type MediaKind = "image" | "pdf";

export interface MediaAttachment {
  /** Display label (basename or "Pasted image"). */
  label: string;
  kind: MediaKind;
  mime: string;
  /** Vault path when the attachment is a vault file (read fresh at send). */
  path?: string;
  /** Base64 payload for pasted/ephemeral media (vault files load lazily). */
  data?: string;
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Anthropic practical limits; oversize attachments are refused with a notice. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Media kind by file extension, or null when the file isn't attachable. */
export function mediaKind(path: string): MediaKind | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  return ext in IMAGE_MIME ? "image" : null;
}

export function mediaMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  return IMAGE_MIME[ext] ?? "application/octet-stream";
}

export function maxBytesFor(kind: MediaKind): number {
  return kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}

/** Build the wire content block for one attachment payload. */
export function mediaBlock(kind: MediaKind, mime: string, base64: string): ContentBlock {
  const source = { type: "base64", media_type: mime, data: base64 } as const;
  return kind === "pdf" ? { type: "document", source } : { type: "image", source };
}

/**
 * Base64-encode a buffer without btoa (works in Node tests and Obsidian
 * alike, and avoids call-stack limits on large files).
 */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += alphabet[b0 >> 2]!;
    out += alphabet[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)]!;
    out += b1 === undefined ? "=" : alphabet[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)]!;
    out += b2 === undefined ? "=" : alphabet[b2 & 0x3f]!;
  }
  return out;
}
