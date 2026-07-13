import { buildProjectSnapshot, type ProjectSnapshot } from "./graph";
import { canonicalSourceId, findDuplicate } from "./identity";
import { parseResearchRecord, type ResearchNoteInput } from "./parse";
import { renderResearchRecord } from "./render";
import type {
  ClaimRecord,
  EvidenceRecord,
  ResearchDocumentRecord,
  ResearchProjectRecord,
  ResearchRecord,
  ResearchSourceRecord,
  ReviewState,
  SourceLocatorKind,
} from "./types";
import { isReviewState } from "./types";

export interface ResearchRepositoryIO {
  listMarkdown(): Promise<ResearchNoteInput[]>;
  createWithParents(path: string, content: string): Promise<void>;
  updateFrontmatter(path: string, mutator: (frontmatter: Record<string, unknown>) => void): Promise<void>;
}

export interface CreateProjectInput {
  title: string;
  question: string;
  folder: string;
  audience?: string;
}

export interface ImportSourceInput {
  title: string;
  sourceKind: ResearchSourceRecord["sourceKind"];
  canonicalId?: string;
  url?: string;
  asset?: string;
  capturedContent?: string | Uint8Array;
  doi?: string;
  arxivId?: string;
  zoteroKey?: string;
  authors?: string[];
  published?: string;
  publication?: string;
}

export type ImportSourceResult = { kind: "created"; path: string } | { kind: "duplicate"; path: string };

export interface CreateEvidenceInput {
  project: string;
  source: string;
  title: string;
  excerpt: string;
  locatorKind?: SourceLocatorKind;
  locatorValue?: string;
  interpretation?: string;
  reviewState?: ReviewState;
  model?: string;
}

export interface CreateClaimInput {
  project: string;
  title: string;
  proposition: string;
  confidence?: ClaimRecord["confidence"];
  reviewState?: ReviewState;
  supports?: string[];
  challenges?: string[];
  contextualizes?: string[];
  limitations?: string[];
}

const LAYOUT = {
  "research-source": "Sources",
  evidence: "Evidence",
  claim: "Claims",
  "research-question": "Questions",
  "research-document": "Documents",
} as const;

function safePath(path: string): string {
  if (!path || path.startsWith("/") || /[\\\0\r\n]/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe research path: ${path}`);
  }
  return path;
}

function safeTitle(title: string): string {
  const value = title.trim();
  if (!value || value === "." || value === ".." || /[\\/\0\r\n]/.test(value)) throw new Error(`Unsafe research title: ${title}`);
  return value;
}

function projectFolder(projectPath: string): string {
  safePath(projectPath);
  if (!projectPath.endsWith("/Project.md")) throw new Error(`Project path must end with /Project.md: ${projectPath}`);
  return projectPath.slice(0, -"/Project.md".length);
}

function recordPath(project: string, type: keyof typeof LAYOUT, title: string): string {
  return `${projectFolder(project)}/${LAYOUT[type]}/${safeTitle(title)}.md`;
}

function parentFolder(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

async function contentFingerprint(content: string | Uint8Array): Promise<string> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : Uint8Array.from(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export class ResearchRepository {
  constructor(private readonly io: ResearchRepositoryIO) {}

  async loadProject(projectPath: string): Promise<ProjectSnapshot> {
    projectFolder(projectPath);
    const parsed = (await this.io.listMarkdown()).map(parseResearchRecord);
    return buildProjectSnapshot(projectPath, parsed.flatMap(({ record }) => record ? [record] : []), parsed.flatMap(({ issues }) => issues));
  }

  async createProject(input: CreateProjectInput): Promise<ResearchProjectRecord> {
    const folder = safePath(input.folder.replace(/\/$/, ""));
    const path = `${folder}/Project.md`;
    const record: ResearchProjectRecord = {
      path,
      title: safeTitle(input.title),
      type: "research-project",
      project: path,
      question: input.question.trim(),
      ...(input.audience?.trim() ? { audience: input.audience.trim() } : {}),
      stage: "frame",
      status: "active",
    };
    if (!record.question) throw new Error("Research question must not be empty");
    await this.createRecord(record);
    return record;
  }

  async importSource(projectPath: string, input: ImportSourceInput): Promise<ImportSourceResult> {
    const project = await this.loadProject(projectPath);
    if (input.asset) safePath(input.asset);
    const fingerprint = input.capturedContent === undefined ? undefined : await contentFingerprint(input.capturedContent);
    const candidate: ResearchSourceRecord = {
      path: recordPath(projectPath, "research-source", input.title),
      title: safeTitle(input.title),
      type: "research-source",
      project: project.project.path,
      sourceKind: input.sourceKind,
      ...(input.canonicalId ? { canonicalId: input.canonicalId } : {}),
      ...(input.url ? { url: input.url } : {}),
      ...(input.asset ? { asset: input.asset } : {}),
      ...(fingerprint ? { contentFingerprint: fingerprint } : {}),
      ...(input.doi ? { doi: input.doi } : {}),
      ...(input.arxivId ? { arxivId: input.arxivId } : {}),
      ...(input.zoteroKey ? { zoteroKey: input.zoteroKey } : {}),
      ...(input.authors?.length ? { authors: [...input.authors] } : {}),
      ...(input.published ? { published: input.published } : {}),
      ...(input.publication ? { publication: input.publication } : {}),
    };
    const canonicalId = canonicalSourceId(candidate);
    if (canonicalId) candidate.canonicalId = canonicalId;
    const duplicate = findDuplicate(candidate, project.sources);
    if (duplicate) return { kind: "duplicate", path: duplicate.path };
    await this.createRecord(candidate);
    return { kind: "created", path: candidate.path };
  }

  async createEvidence(input: CreateEvidenceInput): Promise<EvidenceRecord> {
    const snapshot = await this.loadProject(input.project);
    const source = snapshot.sources.find((candidate) => candidate.path === input.source);
    if (!source) throw new Error(`Source is not part of project: ${input.source}`);
    if (!input.excerpt.trim()) throw new Error("Evidence excerpt must not be empty");
    return this.createTyped({
      path: recordPath(input.project, "evidence", input.title), title: safeTitle(input.title), type: "evidence",
      project: input.project, source: source.path,
      ...(source.contentFingerprint ? { sourceFingerprint: source.contentFingerprint } : {}),
      excerpt: input.excerpt, ...(input.locatorKind ? { locatorKind: input.locatorKind } : {}),
      ...(input.locatorValue ? { locatorValue: input.locatorValue } : {}),
      ...(input.interpretation ? { interpretation: input.interpretation } : {}),
      reviewState: input.reviewState ?? "proposed", ...(input.model ? { model: input.model } : {}),
    });
  }

  async createClaim(input: CreateClaimInput): Promise<ClaimRecord> {
    if (!input.proposition.trim()) throw new Error("Claim proposition must not be empty");
    const snapshot = await this.loadProject(input.project);
    const evidencePaths = new Set(snapshot.evidence.map(({ path }) => path));
    for (const path of [...(input.supports ?? []), ...(input.challenges ?? []), ...(input.contextualizes ?? [])]) {
      if (!evidencePaths.has(path)) throw new Error(`Evidence is not part of project: ${path}`);
    }
    return this.createTyped({
      path: recordPath(input.project, "claim", input.title), title: safeTitle(input.title), type: "claim", project: input.project,
      proposition: input.proposition, confidence: input.confidence ?? "moderate", reviewState: input.reviewState ?? "proposed",
      supports: [...(input.supports ?? [])], challenges: [...(input.challenges ?? [])], contextualizes: [...(input.contextualizes ?? [])], limitations: [...(input.limitations ?? [])],
    });
  }

  async createOutline(projectPath: string, claimPaths: string[]): Promise<{ path: string; content: string }> {
    const snapshot = await this.loadProject(projectPath);
    const claims = claimPaths.map((path) => {
      const claim = snapshot.claims.find((candidate) => candidate.path === path);
      if (!claim) throw new Error(`Claim is not part of project: ${path}`);
      return claim;
    });
    const record: ResearchDocumentRecord = { path: `${projectFolder(projectPath)}/Documents/Outline.md`, title: "Outline", type: "research-document", project: projectPath, documentKind: "outline", claims: claims.map(({ path }) => path) };
    const content = renderResearchRecord(record);
    await this.createRecord(record);
    return { path: record.path, content };
  }

  private async createRecord(record: ResearchRecord): Promise<void> {
    safePath(record.path);
    const folder = projectFolder(record.type === "research-project" ? record.path : record.project);
    const expectedParent = record.type === "research-project" ? folder : `${folder}/${LAYOUT[record.type]}`;
    if (parentFolder(record.path) !== expectedParent) throw new Error(`Research record is outside canonical layout: ${record.path}`);
    if (record.type === "research-project" && record.project !== record.path) throw new Error(`Research project must link to itself: ${record.path}`);
    try {
      await this.io.createWithParents(record.path, renderResearchRecord(record));
    } catch (error) {
      if (error instanceof Error && /already exists/i.test(error.message)) throw new Error(`Research record already exists: ${record.path}`);
      throw error;
    }
  }

  async setReviewState(path: string, state: ReviewState): Promise<void> {
    safePath(path);
    if (!isReviewState(state)) throw new Error(`Invalid review state: ${String(state)}`);
    const note = (await this.io.listMarkdown()).find((candidate) => candidate.path === path);
    if (!note) throw new Error(`Research record not found: ${path}`);
    const result = parseResearchRecord(note);
    if (!result.record || !("reviewState" in result.record)) throw new Error(`Record has no review state: ${path}`);
    await this.io.updateFrontmatter(path, (frontmatter) => { frontmatter.review_state = state; });
  }

  private async createTyped<T extends ResearchRecord>(record: T): Promise<T> {
    await this.loadProject(record.project);
    await this.createRecord(record);
    return record;
  }
}
