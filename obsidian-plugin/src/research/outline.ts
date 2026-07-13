import { isStaleEvidence, isTrustedEvidence, type ProjectClaim, type ProjectSnapshot } from "./graph";
import type { EvidenceRecord, EvidenceRelation } from "./types";
import { buildFrontmatter } from "../indexing/frontmatter";

function evidence(snapshot: ProjectSnapshot, path: string): EvidenceRecord {
  const item = snapshot.evidence.find((candidate) => candidate.path === path);
  if (!item) throw new Error(`Evidence is not part of project: ${path}`);
  return item;
}

function matrixEvidence(snapshot: ProjectSnapshot, relation: EvidenceRelation, path: string): string {
  const item = evidence(snapshot, path);
  const source = snapshot.sources.find((candidate) => candidate.path === item.source);
  if (!source) throw new Error(`Source is not part of project: ${item.source}`);
  const trust = isTrustedEvidence(item, source) ? "trusted" : isStaleEvidence(item, source) ? "stale; untrusted" : "untrusted";
  const locator = item.locatorKind && item.locatorValue ? `${item.locatorKind} ${item.locatorValue}` : "locator missing";
  const fingerprint = item.sourceFingerprint ?? "fingerprint missing";
  return `${relation}: [[${item.path}|${item.title}]] (${item.reviewState}; ${trust}; source [[${source.path}|${source.title}]]; ${locator}; ${fingerprint})`;
}

function renderEvidence(snapshot: ProjectSnapshot, relation: EvidenceRelation, path: string): string[] {
  const item = evidence(snapshot, path);
  const source = snapshot.sources.find((candidate) => candidate.path === item.source);
  if (!source) throw new Error(`Source is not part of project: ${item.source}`);
  return [
    `- **${item.title}** (${relation}; ${item.reviewState})`,
    `  - Evidence: [[${item.path}]]`,
    `  - Source: [[${source.path}]]`,
    `  - Locator: ${item.locatorKind ?? "missing"} ${item.locatorValue ?? "missing"}`,
    `  - Source fingerprint: ${item.sourceFingerprint ? `\`${item.sourceFingerprint}\`` : "not captured"}`,
    ...item.excerpt.split("\n").map((line) => `  > ${line}`),
  ];
}

function exclusion(snapshot: ProjectSnapshot, relation: EvidenceRelation, path: string): string {
  const item = evidence(snapshot, path);
  const source = snapshot.sources.find((candidate) => candidate.path === item.source);
  const reasons = [
    item.reviewState !== "reviewed" ? item.reviewState : undefined,
    !item.locatorKind || !item.locatorValue?.trim() ? "locator missing" : undefined,
    !source ? "source missing" : undefined,
    isStaleEvidence(item, source) ? "stale" : undefined,
  ].filter((reason): reason is string => Boolean(reason));
  return `- [[${item.path}|${item.title}]] (${relation}; excluded: ${reasons.join(", ") || "untrusted"})`;
}

function renderRelation(snapshot: ProjectSnapshot, relation: EvidenceRelation, paths: string[]): { included: string[]; excluded: string[] } {
  const included: string[] = [];
  const excluded: string[] = [];
  for (const path of paths) {
    const item = evidence(snapshot, path);
    const source = snapshot.sources.find((candidate) => candidate.path === item.source);
    if (isTrustedEvidence(item, source)) included.push(...renderEvidence(snapshot, relation, path));
    else excluded.push(exclusion(snapshot, relation, path));
  }
  return { included, excluded };
}

function claim(snapshot: ProjectSnapshot, path: string): ProjectClaim {
  const item = snapshot.claims.find((candidate) => candidate.path === path);
  if (!item) throw new Error(`Claim is not part of project: ${path}`);
  return item;
}

export function renderSynthesisMatrix(snapshot: ProjectSnapshot): string {
  const rows = snapshot.claims.map((item) => [
    `[[${item.path}|${item.title}]]`,
    item.supporting.map((path) => matrixEvidence(snapshot, "supports", path)).join("<br>") || "—",
    item.challenging.map((path) => matrixEvidence(snapshot, "challenges", path)).join("<br>") || "—",
    item.contextual.map((path) => matrixEvidence(snapshot, "contextualizes", path)).join("<br>") || "—",
  ].map((cell) => cell.replaceAll("|", "\\|")).join(" | "));
  return ["| Claim | Supports | Challenges | Contextualizes |", "| --- | --- | --- | --- |", ...rows.map((row) => `| ${row} |`)].join("\n");
}

export function renderEvidenceOutline(snapshot: ProjectSnapshot, claimPaths: string[]): string {
  const claims = claimPaths.map((path) => claim(snapshot, path));
  const unsafe = claims.find(({ reviewState }) => reviewState !== "reviewed");
  if (unsafe) throw new Error(`Cannot create a trusted outline from ${unsafe.reviewState} claim: ${unsafe.path}. Review the claim first or remove it from the selection.`);
  const sections = claims.flatMap((item) => {
    const supporting = renderRelation(snapshot, "supports", item.supporting);
    const challenging = renderRelation(snapshot, "challenges", item.challenging);
    const contextual = renderRelation(snapshot, "contextualizes", item.contextual);
    const excluded = [...supporting.excluded, ...challenging.excluded, ...contextual.excluded];
    return [
    `## ${item.title}`,
    "",
    item.proposition,
    "",
    `Confidence: ${item.confidence}; review state: ${item.reviewState}.`,
    ...(item.limitations.length ? ["", `Limitations: ${item.limitations.join("; ")}`] : []),
    "", "### Supporting evidence", "", ...supporting.included,
    "", "### Challenging evidence", "", ...challenging.included,
    "", "### Contextual evidence", "", ...contextual.included,
    ...(excluded.length ? ["", "### Excluded evidence", "", ...excluded] : []), "",
    ];
  });
  const frontmatter = buildFrontmatter({ title: `${snapshot.project.title} — Evidence-backed outline`, type: "research-document", project: `[[${snapshot.project.path}]]`, document_kind: "outline", claims: claims.map(({ path }) => `[[${path}]]`) });
  return [frontmatter, "", `# ${snapshot.project.title} — Evidence-backed outline`, "", ...sections].join("\n");
}
