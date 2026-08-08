import type { SourceRecord } from "./types";
import { sanitize } from "../memory/sanitize";

const REDACTION_MARKER = "‹REDACTED›";
const PLACEHOLDER_TITLES = new Set([
  "article",
  "capture",
  "clipping",
  "dataset",
  "document",
  "file",
  "no title",
  "note",
  "source",
  "title",
  "unknown title",
  "untitled",
  "untitled document",
  "video",
]);

export class EnrichmentQualityError extends Error {
  constructor(readonly errors: string[]) {
    super(`enrichment quality failed: ${errors.join("; ")}`);
    this.name = "EnrichmentQualityError";
  }
}

function hasSecretBearingContent(value: string): boolean {
  return value.includes(REDACTION_MARKER) || sanitize(value) !== value;
}

function isPlaceholderTitle(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length === 0 || PLACEHOLDER_TITLES.has(normalized)) return true;
  const filename = /^(.+)\.[a-z0-9]{1,8}$/i.exec(normalized);
  return filename !== null && PLACEHOLDER_TITLES.has(filename[1] ?? "");
}

export function validateEnrichment(record: SourceRecord): void {
  const errors: string[] = [];
  const fields = record?.fields as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new EnrichmentQualityError(["fields: expected a record"]);
  }

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      if (hasSecretBearingContent(value)) errors.push(`fields.${key}: contains secret-bearing content`);
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) errors.push(`fields.${key}: expected a finite number`);
      continue;
    }
    if (Array.isArray(value)) {
      if (!value.every((item) => typeof item === "string")) {
        errors.push(`fields.${key}: expected an array of strings`);
        continue;
      }
      for (const [index, item] of value.entries()) {
        if (hasSecretBearingContent(item)) errors.push(`fields.${key}[${index}]: contains secret-bearing content`);
      }
      continue;
    }
    errors.push(`fields.${key}: expected a string, finite number, or array of strings`);
  }

  const title = fields.title;
  if (typeof title !== "string" || isPlaceholderTitle(title)) {
    errors.push("title: must be a meaningful, non-placeholder title");
  }

  const summary = fields.summary;
  if (typeof summary !== "string" || summary.trim().length === 0) {
    errors.push("summary: must be a non-empty string");
  } else if ([...summary].length > 200) {
    errors.push("summary: must be at most 200 characters");
  }

  if (errors.length > 0) throw new EnrichmentQualityError(errors);
}

export function markdownBody(content: string): string {
  const opening = /^---[ \t]*\r?\n/.exec(content);
  if (!opening) return content;

  let offset = opening[0].length;
  while (offset <= content.length) {
    const nextLf = content.indexOf("\n", offset);
    const lineEnd = nextLf === -1 ? content.length : nextLf > offset && content[nextLf - 1] === "\r" ? nextLf - 1 : nextLf;
    const line = content.slice(offset, lineEnd);
    if (/^---[ \t]*$/.test(line)) return content.slice(nextLf === -1 ? lineEnd : nextLf + 1);
    if (nextLf === -1) break;
    offset = nextLf + 1;
  }
  return content;
}

export function assertBodyPreserved(before: string, after: string): void {
  if (markdownBody(before) !== markdownBody(after)) {
    throw new EnrichmentQualityError(["markdown body changed during enrichment"]);
  }
}
