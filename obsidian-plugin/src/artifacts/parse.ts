// Pure (Obsidian-free) artifact parsing helpers, unit-testable in isolation.

export interface ExtractedArtifact {
  /** Inner HTML (a full document) extracted from a ```claude-html block. */
  html: string;
  /** A best-effort title pulled from <title> or the first heading. */
  title: string;
}

const CLAUDE_HTML_RE = /```claude-html[^\n]*\n([\s\S]*?)```/i;
// Also accept a plain ```html block that contains a full document.
const HTML_DOC_RE = /```html[^\n]*\n(\s*<!DOCTYPE[\s\S]*?)```/i;

/** Find the first renderable HTML artifact inside an assistant message. */
export function extractArtifact(markdown: string): ExtractedArtifact | null {
  const m = CLAUDE_HTML_RE.exec(markdown) ?? HTML_DOC_RE.exec(markdown);
  if (!m) return null;
  const html = m[1].trim();
  if (html.length === 0) return null;
  return { html, title: titleFromHtml(html) };
}

export function titleFromHtml(html: string): string {
  const t = /<title>([^<]+)<\/title>/i.exec(html);
  if (t) return t[1].trim();
  const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h) return h[1].replace(/<[^>]+>/g, "").trim();
  return "Claude artifact";
}

export function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|#^[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Untitled"
  );
}
