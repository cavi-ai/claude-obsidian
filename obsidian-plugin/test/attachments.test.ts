import { describe, it, expect } from "vitest";
import { mediaKind, mediaMime, maxBytesFor, mediaBlock, arrayBufferToBase64, MAX_IMAGE_BYTES, MAX_PDF_BYTES } from "../src/context/attachments";

describe("mediaKind / mediaMime", () => {
  it("classifies pdfs and common image types (case-insensitive)", () => {
    expect(mediaKind("Docs/paper.PDF")).toBe("pdf");
    expect(mediaKind("img/shot.png")).toBe("image");
    expect(mediaKind("img/photo.JPeG")).toBe("image");
    expect(mediaKind("img/anim.webp")).toBe("image");
    expect(mediaKind("Note.md")).toBeNull();
    expect(mediaKind("archive.zip")).toBeNull();
  });

  it("maps mimes", () => {
    expect(mediaMime("a.pdf")).toBe("application/pdf");
    expect(mediaMime("a.jpg")).toBe("image/jpeg");
    expect(mediaMime("a.png")).toBe("image/png");
  });

  it("has per-kind size caps", () => {
    expect(maxBytesFor("image")).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesFor("pdf")).toBe(MAX_PDF_BYTES);
    expect(MAX_PDF_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
  });
});

describe("mediaBlock", () => {
  it("builds an image block", () => {
    expect(mediaBlock("image", "image/png", "AAAA")).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    });
  });

  it("builds a document block for pdfs", () => {
    expect(mediaBlock("pdf", "application/pdf", "AAAA")).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "AAAA" },
    });
  });
});

describe("arrayBufferToBase64", () => {
  const enc = (s: string): string => arrayBufferToBase64(new TextEncoder().encode(s).buffer as ArrayBuffer);

  it("matches known vectors including padding", () => {
    expect(enc("")).toBe("");
    expect(enc("f")).toBe("Zg==");
    expect(enc("fo")).toBe("Zm8=");
    expect(enc("foo")).toBe("Zm9v");
    expect(enc("foobar")).toBe("Zm9vYmFy");
  });

  it("round-trips binary data against Node's Buffer", () => {
    const bytes = new Uint8Array(1024).map((_, i) => (i * 31) % 256);
    expect(arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString("base64"));
  });
});
