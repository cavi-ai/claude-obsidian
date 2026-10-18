import { describe, expect, it } from "vitest";
import { readTurnMedia, rememberTurnMedia } from "../../src/chat/turnMedia";
import { toApiMessages } from "../../src/conversations/store";
import type { ChatMessage } from "../../src/types";

const image = { label: "Chart A", kind: "image" as const, mime: "image/png", path: "Chart A.png", data: "private-image-bytes" };
const question = (media = rememberTurnMedia([image])): ChatMessage => ({ role: "user", content: "Question A", media });

describe("accepted turn media", () => {
  it("keeps media on its question across histories and excludes it from text history payloads", () => {
    const a = question();
    const b: ChatMessage = { role: "user", content: "Text only B" };
    expect(readTurnMedia([a, { role: "assistant", content: "A" }, b])).toEqual([]);
    expect(readTurnMedia([a])).toEqual([image]);
    expect(toApiMessages([a])).toEqual([{ role: "user", content: "Question A" }]);
  });
  it("serializes only references and reopens vault media after reload", () => {
    const serialized = JSON.stringify(question());
    expect(serialized).not.toContain("private-image-bytes");
    expect(readTurnMedia([JSON.parse(serialized)])).toEqual([{ label: "Chart A", kind: "image", mime: "image/png", path: "Chart A.png" }]);
  });
  it("keeps live pasted bytes only for their own question and refuses expired bytes", () => {
    const { path: _path, ...pasted } = image;
    const message = question(rememberTurnMedia([pasted]));
    expect(readTurnMedia([message])[0]).toBe(pasted);
    expect(() => readTurnMedia([JSON.parse(JSON.stringify(message))])).toThrow("Paste it again and resend the question");
  });
  it("never accepts inline payloads injected into persisted references", () => {
    const persisted = JSON.parse(JSON.stringify(question()));
    persisted.media[0].data = "untrusted-inline-data";
    expect(readTurnMedia([persisted])[0]).not.toHaveProperty("data");
  });
  it.each([null, {}, [{ kind: "audio", label: "x", mime: "audio/mp3" }], [{ kind: "image", label: "x", mime: "image/png", path: 42 }]])("refuses malformed attachment records %j", (media) => {
    expect(() => readTurnMedia([{ role: "user", content: "A", media } as ChatMessage])).toThrow("Original attachments are invalid");
  });
});
