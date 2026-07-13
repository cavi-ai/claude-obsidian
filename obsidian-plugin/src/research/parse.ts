import {
  RESEARCH_TYPE_NAMES,
  REVIEW_STATES,
  type ResearchRecord,
  type ResearchTypeName,
} from "./types";

export interface ResearchNoteInput {
  path: string;
  frontmatter?: Record<string, unknown>;
  body: string;
}

export interface ParseIssue {
  path: string;
  code: "unknown-type" | "missing-field" | "invalid-value" | "missing-locator";
  message: string;
}

export interface ParseResearchResult {
  record?: ResearchRecord;
  issues: ParseIssue[];
}

type IssueCode = ParseIssue["code"];

function issue(input: ResearchNoteInput, issues: ParseIssue[], code: IssueCode, message: string): void {
  issues.push({ path: input.path, code, message });
}

function scalar(input: ResearchNoteInput, issues: ParseIssue[], key: string, required = false): string | undefined {
  const value = input.frontmatter?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value !== undefined) issue(input, issues, "invalid-value", `${key} must be a non-empty string`);
  else if (required) issue(input, issues, "missing-field", `Missing required field: ${key}`);
  return undefined;
}

function oneOf<T extends string>(input: ResearchNoteInput, issues: ParseIssue[], key: string, values: readonly T[], required = true): T | undefined {
  const value = scalar(input, issues, key, required);
  if (value === undefined) return undefined;
  if ((values as readonly string[]).includes(value)) return value as T;
  issue(input, issues, "invalid-value", `${key} must be one of: ${values.join(", ")}`);
  return undefined;
}

function stringList(input: ResearchNoteInput, issues: ParseIssue[], key: string): string[] {
  const value = input.frontmatter?.[key];
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim())) {
    return value.map((item) => (item as string).trim());
  }
  issue(input, issues, "invalid-value", `${key} must be a list of non-empty strings`);
  return [];
}

function locatorValue(input: ResearchNoteInput, issues: ParseIssue[]): string | undefined {
  const value = input.frontmatter?.locator_value;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value !== undefined) issue(input, issues, "invalid-value", "locator_value must be a string or number");
  return undefined;
}

function excerptFromBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => /^> ?/.test(line))
    .map((line) => line.replace(/^> ?/, ""))
    .join("\n")
    .trim();
}

function interpretationFromBody(body: string): string | undefined {
  const match = body.match(/(?:^|\n)Interpretation:\s*([^\n]+(?:\n(?!\s*#)[^\n]+)*)/i);
  return match?.[1]?.trim() || undefined;
}

function parseTypedRecord(type: ResearchTypeName, input: ResearchNoteInput, issues: ParseIssue[]): ParseResearchResult {
  const title = scalar(input, issues, "title", true);
  const project = scalar(input, issues, "project", true);
  if (!title || !project) return { issues };

  if (type === "research-project") {
    const question = scalar(input, issues, "question", true);
    const stage = oneOf(input, issues, "stage", ["frame", "gather", "read", "reason", "shape", "write", "assure"] as const);
    const status = oneOf(input, issues, "status", ["active", "paused", "complete"] as const);
    if (!question) return { issues };
    if (!stage || !status) return { issues };
    const audience = scalar(input, issues, "audience");
    return { record: { path: input.path, title, type, project, question, ...(audience ? { audience } : {}), stage, status }, issues };
  }

  if (type === "research-source") {
    const sourceKind = oneOf(input, issues, "source_kind", ["pdf", "web", "doi", "arxiv", "zotero", "vault"] as const);
    if (!sourceKind) return { issues };
    const canonicalId = scalar(input, issues, "canonical_id");
    const url = scalar(input, issues, "url");
    const asset = scalar(input, issues, "asset");
    const contentFingerprint = scalar(input, issues, "content_fingerprint");
    return { record: { path: input.path, title, type, project, sourceKind, ...(canonicalId ? { canonicalId } : {}), ...(url ? { url } : {}), ...(asset ? { asset } : {}), ...(contentFingerprint ? { contentFingerprint } : {}) }, issues };
  }

  if (type === "evidence") {
    const source = scalar(input, issues, "source", true);
    const excerpt = excerptFromBody(input.body);
    if (!excerpt) issue(input, issues, "missing-field", "Missing required evidence excerpt");
    const reviewState = oneOf(input, issues, "review_state", REVIEW_STATES);
    const locatorKind = oneOf(input, issues, "locator_kind", ["page", "section", "paragraph", "timestamp", "quote"] as const, false);
    const parsedLocatorValue = locatorValue(input, issues);
    if (!locatorKind || !parsedLocatorValue) issue(input, issues, "missing-locator", "Evidence should identify both locator_kind and locator_value");
    if (!source || !excerpt || !reviewState) return { issues };
    const interpretation = interpretationFromBody(input.body);
    const model = scalar(input, issues, "model");
    return { record: { path: input.path, title, type, project, source, ...(locatorKind ? { locatorKind } : {}), ...(parsedLocatorValue ? { locatorValue: parsedLocatorValue } : {}), excerpt, ...(interpretation ? { interpretation } : {}), reviewState, ...(model ? { model } : {}) }, issues };
  }

  if (type === "claim") {
    const proposition = scalar(input, issues, "proposition", true);
    const confidence = oneOf(input, issues, "confidence", ["low", "moderate", "high"] as const);
    const reviewState = oneOf(input, issues, "review_state", REVIEW_STATES);
    if (!proposition || !confidence || !reviewState) return { issues };
    return { record: { path: input.path, title, type, project, proposition, confidence, reviewState, supports: stringList(input, issues, "supports"), challenges: stringList(input, issues, "challenges"), contextualizes: stringList(input, issues, "contextualizes"), limitations: stringList(input, issues, "limitations") }, issues };
  }

  if (type === "research-question") {
    const question = scalar(input, issues, "question", true);
    const status = oneOf(input, issues, "status", ["open", "resolved"] as const);
    if (!question || !status) return { issues };
    const about = scalar(input, issues, "about");
    return { record: { path: input.path, title, type, project, question, status, ...(about ? { about } : {}) }, issues };
  }

  const documentKind = oneOf(input, issues, "document_kind", ["outline", "draft"] as const);
  if (!documentKind) return { issues };
  return { record: { path: input.path, title, type, project, documentKind, claims: stringList(input, issues, "claims") }, issues };
}

export function parseResearchRecord(input: ResearchNoteInput): ParseResearchResult {
  const type = input.frontmatter?.type;
  if (typeof type !== "string" || !(RESEARCH_TYPE_NAMES as readonly string[]).includes(type)) return { issues: [] };
  return parseTypedRecord(type as ResearchTypeName, input, []);
}
