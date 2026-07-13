import type { ParseIssue } from "./parse";
import type {
  ClaimRecord,
  EvidenceRecord,
  QuestionRecord,
  ResearchDocumentRecord,
  ResearchProjectRecord,
  ResearchRecord,
  ResearchSourceRecord,
} from "./types";

export interface ProjectClaim extends ClaimRecord {
  supporting: string[];
  challenging: string[];
  contextual: string[];
  trustedSupportCount: number;
}

export interface ProjectHealth {
  claimCount: number;
  trustedSupportCount: number;
  supportedClaimCount: number;
}

export interface ProjectSnapshot {
  project: ResearchProjectRecord;
  sources: ResearchSourceRecord[];
  evidence: EvidenceRecord[];
  claims: ProjectClaim[];
  questions: QuestionRecord[];
  documents: ResearchDocumentRecord[];
  issues: ParseIssue[];
  health: ProjectHealth;
}

function freezeRecord<T extends ResearchRecord>(record: T): Readonly<T> {
  const clone = { ...record };
  for (const key of ["authors", "supports", "challenges", "contextualizes", "limitations", "claims"] as const) {
    const value = clone[key as keyof T];
    if (Array.isArray(value)) Object.assign(clone, { [key]: Object.freeze([...value]) });
  }
  return Object.freeze(clone);
}

function hasLocator(evidence: EvidenceRecord): boolean {
  return Boolean(evidence.locatorKind && evidence.locatorValue?.trim());
}

export function isStaleEvidence(evidence: EvidenceRecord, source: ResearchSourceRecord | undefined): boolean {
  return Boolean(source?.contentFingerprint && evidence.sourceFingerprint && source.contentFingerprint !== evidence.sourceFingerprint);
}

export function isTrustedEvidence(evidence: EvidenceRecord | undefined, source: ResearchSourceRecord | undefined): boolean {
  return Boolean(evidence && source && evidence.reviewState === "reviewed" && hasLocator(evidence) && !isStaleEvidence(evidence, source));
}

export function buildProjectSnapshot(projectPath: string, records: ResearchRecord[], parseIssues: ParseIssue[]): ProjectSnapshot {
  const unique = new Map<string, ResearchRecord>();
  const issues = parseIssues.map((entry) => Object.freeze({ ...entry }));
  for (const record of records) {
    if (unique.has(record.path)) {
      issues.push(Object.freeze({ path: record.path, code: "invalid-value", message: `Duplicate research record path: ${record.path}` }));
    } else {
      unique.set(record.path, freezeRecord(record));
    }
  }

  const project = unique.get(projectPath);
  if (project?.type !== "research-project") throw new Error(`Research project not found: ${projectPath}`);
  const scoped = [...unique.values()].filter((record) => record.path === projectPath || record.project === projectPath);
  const sources = scoped.filter((record): record is ResearchSourceRecord => record.type === "research-source");
  const evidence = scoped.filter((record): record is EvidenceRecord => record.type === "evidence");
  const evidenceByPath = new Map(evidence.map((record) => [record.path, record]));
  const sourceByPath = new Map(sources.map((record) => [record.path, record]));
  const claims = scoped.filter((record): record is ClaimRecord => record.type === "claim").map((record): ProjectClaim => {
    const trustedSupportCount = record.supports.filter((path) => {
      const item = evidenceByPath.get(path);
      return isTrustedEvidence(item, item ? sourceByPath.get(item.source) : undefined);
    }).length;
    return Object.freeze({ ...record, supporting: record.supports, challenging: record.challenges, contextual: record.contextualizes, trustedSupportCount });
  });
  const questions = scoped.filter((record): record is QuestionRecord => record.type === "research-question");
  const documents = scoped.filter((record): record is ResearchDocumentRecord => record.type === "research-document");
  const health = Object.freeze({
    claimCount: claims.length,
    trustedSupportCount: claims.reduce((sum, claim) => sum + claim.trustedSupportCount, 0),
    supportedClaimCount: claims.filter((claim) => claim.trustedSupportCount > 0).length,
  });
  return Object.freeze({ project, sources: Object.freeze(sources), evidence: Object.freeze(evidence), claims: Object.freeze(claims), questions: Object.freeze(questions), documents: Object.freeze(documents), issues: Object.freeze(issues), health }) as ProjectSnapshot;
}
