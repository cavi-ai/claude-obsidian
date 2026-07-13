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
  const sections = claims.flatMap((item) => [
    `## ${item.title}`,
    "",
    item.proposition,
    "",
    `Confidence: ${item.confidence}; review state: ${item.reviewState}.`,
    ...(item.limitations.length ? ["", `Limitations: ${item.limitations.join("; ")}`] : []),
    "", "### Supporting evidence", "", ...item.supporting.flatMap((path) => renderEvidence(snapshot, "supports", path)),
    "", "### Challenging evidence", "", ...item.challenging.flatMap((path) => renderEvidence(snapshot, "challenges", path)),
    "", "### Contextual evidence", "", ...item.contextual.flatMap((path) => renderEvidence(snapshot, "contextualizes", path)), "",
  ]);
  const frontmatter = buildFrontmatter({ title: `${snapshot.project.title} — Evidence-backed outline`, type: "research-document", project: `[[${snapshot.project.path}]]`, document_kind: "outline", claims: claims.map(({ path }) => `[[${path}]]`) });
  return [frontmatter, "", `# ${snapshot.project.title} — Evidence-backed outline`, "", ...sections].join("\n");
}
