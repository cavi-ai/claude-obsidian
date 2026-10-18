import type { ContextToggles } from "../../types";
import type { AttachedPath } from "../../context/vaultContext";
import type { Composer } from "./Composer";
import { mediaKind, mediaMime, type MediaAttachment } from "../../context/attachments";
import { MAX_PAGE_CONTEXT_CHARS, type AttachedPage } from "../../context/urlContext";

type ContextHost = Pick<Composer, "contextToggles" | "attachedPaths" | "attachedMedia" | "attachedPages" | "renderContextManager">;
const AUTOMATIC = ["activeNote", "selection", "linkedNotes", "searchVault"] as const;

function storedPage(page: AttachedPage): AttachedPage {
  const error = page.pending ? "Page capture was interrupted. Retry capture to attach the page." : page.error || (!page.markdown.trim() ? "No readable content on that page." : undefined);
  return { url: page.url, markdown: error ? "" : page.markdown.slice(0, MAX_PAGE_CONTEXT_CHARS), ...(page.title !== undefined ? { title: page.title } : {}), ...(error ? { error } : {}) };
}

function restoredPage(value: unknown): AttachedPage[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const { url, markdown, title, error, pending } = value as Record<string, unknown>;
  if (typeof url !== "string" || typeof markdown !== "string") return [];
  try { if (!["http:", "https:"].includes(new URL(url).protocol)) return []; }
  catch { return []; }
  return [storedPage({ url, markdown, ...(typeof title === "string" ? { title } : {}), ...(typeof error === "string" ? { error } : {}), ...(pending === true ? { pending } : {}) })];
}

/** Persist explicit vault references, captured page excerpts, and context choices with the draft. */
export function draftContextState(host: ContextHost, defaults: ContextToggles): Record<string, unknown> {
  const media = host.attachedMedia.filter((item) => item.path).map(({ kind, label, path, mime }) => ({ kind, label, path, mime }));
  const pages = host.attachedPages.map(storedPage);
  if (!host.attachedPaths.length && !media.length && !pages.length && AUTOMATIC.every((key) => host.contextToggles[key] === defaults[key])) return {};
  return { context: { automatic: { ...host.contextToggles }, paths: host.attachedPaths.map((entry) => ({ ...entry })), media, pages } };
}

export function restoreDraftContext(host: ContextHost, state: unknown): boolean {
  const context = (state as { context?: unknown } | null)?.context;
  if (!context || typeof context !== "object" || Array.isArray(context)) return false;
  const { automatic, paths, media, pages } = context as Record<string, unknown>;
  if (automatic && typeof automatic === "object" && !Array.isArray(automatic)) {
    const toggles = { ...host.contextToggles };
    for (const key of AUTOMATIC) {
      const value = (automatic as Record<string, unknown>)[key];
      if (typeof value === "boolean") toggles[key] = value;
    }
    host.contextToggles = toggles;
  }
  if (Array.isArray(paths)) {
    host.attachedPaths = paths.filter((entry: unknown): entry is AttachedPath => {
      if (!entry || typeof entry !== "object") return false;
      const { path, kind } = entry as Record<string, unknown>;
      return typeof path === "string" && path.length > 0 && (kind === "note" || kind === "folder");
    }).map(({ path, kind }) => ({ path, kind }));
  }
  if (Array.isArray(media)) {
    host.attachedMedia = media.filter((entry: unknown): entry is MediaAttachment & { path: string } => {
      if (!entry || typeof entry !== "object") return false;
      const { path, kind, label } = entry as Record<string, unknown>;
      return typeof path === "string" && typeof label === "string" && mediaKind(path) !== null && mediaKind(path) === kind;
    }).map(({ path, kind, label }) => ({ path, kind, label, mime: mediaMime(path) }));
  }
  if (Array.isArray(pages)) host.attachedPages = pages.flatMap(restoredPage);
  host.renderContextManager();
  return true;
}
