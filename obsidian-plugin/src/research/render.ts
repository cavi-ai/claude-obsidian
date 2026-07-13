import { buildFrontmatter, type FrontmatterData } from "../indexing/frontmatter";
import type { ResearchRecord } from "./types";

function quoteExcerpt(excerpt: string): string {
  return excerpt.split("\n").map((line) => `> ${line}`).join("\n");
}

function wikilink(path: string): string {
  return `[[${path}]]`;
}

function researchFrontmatter(data: FrontmatterData, locatorValue?: string): string {
  const rendered = buildFrontmatter(data);
  if (locatorValue === undefined) return rendered;
  return rendered.replace(/^locator_value:.*$/m, `locator_value: ${JSON.stringify(locatorValue)}`);
}

export function renderResearchRecord(record: ResearchRecord): string {
  const common: FrontmatterData = { title: record.title, type: record.type, project: wikilink(record.project) };
  let frontmatter: FrontmatterData;
  let body: string;

  switch (record.type) {
    case "research-project":
      frontmatter = { ...common, question: record.question, audience: record.audience, stage: record.stage, status: record.status };
      body = `# Research project\n\n## Question\n\n${record.question}`;
      break;
    case "research-source":
      frontmatter = { ...common, source_kind: record.sourceKind, canonical_id: record.canonicalId, url: record.url, asset: record.asset ? wikilink(record.asset) : undefined, content_fingerprint: record.contentFingerprint };
      body = "# Research source\n\n## Notes";
      break;
    case "evidence":
      frontmatter = { ...common, source: wikilink(record.source), locator_kind: record.locatorKind, locator_value: record.locatorValue, review_state: record.reviewState, model: record.model };
      body = `# Evidence\n\n${quoteExcerpt(record.excerpt)}${record.interpretation ? `\n\nInterpretation: ${record.interpretation}` : ""}`;
      break;
    case "claim":
      frontmatter = { ...common, proposition: record.proposition, confidence: record.confidence, review_state: record.reviewState, supports: record.supports.map(wikilink), challenges: record.challenges.map(wikilink), contextualizes: record.contextualizes.map(wikilink), limitations: record.limitations };
      body = `# Claim\n\n## Proposition\n\n${record.proposition}`;
      break;
    case "research-question":
      frontmatter = { ...common, question: record.question, status: record.status, about: record.about ? wikilink(record.about) : undefined };
      body = `# Research question\n\n## Question\n\n${record.question}`;
      break;
    case "research-document":
      frontmatter = { ...common, document_kind: record.documentKind, claims: record.claims.map(wikilink) };
      body = `# Research document\n\n## ${record.documentKind === "outline" ? "Outline" : "Draft"}`;
      break;
  }

  return `${researchFrontmatter(frontmatter, record.type === "evidence" ? record.locatorValue : undefined)}\n\n${body}\n`;
}
