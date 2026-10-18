import type { ContextToggles } from "../../types";
import type { AttachedPath } from "../../context/vaultContext";
import type { Composer } from "./Composer";
import { mediaKind, mediaMime, type MediaAttachment } from "../../context/attachments";

type ContextHost = Pick<Composer, "contextToggles" | "attachedPaths" | "attachedMedia" | "renderContextManager">;
const AUTOMATIC = ["activeNote", "selection", "linkedNotes", "searchVault"] as const;

/** Persist the pane's explicit vault references and context choices with its draft. */
export function draftContextState(host: ContextHost, defaults: ContextToggles): Record<string, unknown> {
  const media = host.attachedMedia.filter((item) => item.path).map(({ kind, label, path, mime }) => ({ kind, label, path, mime }));
  if (!host.attachedPaths.length && !media.length && AUTOMATIC.every((key) => host.contextToggles[key] === defaults[key])) return {};
  return { context: { automatic: { ...host.contextToggles }, paths: host.attachedPaths.map((entry) => ({ ...entry })), media } };
}

export function restoreDraftContext(host: ContextHost, state: unknown): boolean {
  const context = (state as { context?: unknown } | null)?.context;
  if (!context || typeof context !== "object" || Array.isArray(context)) return false;
  const { automatic, paths, media } = context as Record<string, unknown>;
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
  host.renderContextManager();
  return true;
}
