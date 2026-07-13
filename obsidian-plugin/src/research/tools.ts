import type { McpToolDef } from "../mcp/protocol";
import { auditProject } from "./audit";
import type { ResearchRepository } from "./repository";
import { isReviewState, type EvidenceRelation, type SourceLocatorKind } from "./types";

export const RESEARCH_WRITE_TOOLS = new Set(["research_evidence_create", "research_claim_create", "research_claim_link", "research_outline_create"]);

type Repository = Pick<ResearchRepository, "loadProject" | "createEvidence" | "createClaim" | "linkClaimEvidence" | "createOutline">;

const object = (properties: Record<string, unknown>, required: string[]): McpToolDef["inputSchema"] => ({ type: "object", properties, required });
const text = (description: string) => ({ type: "string", description });

export class ResearchTools {
  constructor(private readonly repository: Repository) {}

  definitions(): McpToolDef[] {
    const project = { project: text("Vault path to the research Project.md note.") };
    return [
      { name: "research_project_read", description: "Read a compact research project snapshot with sources, evidence, claims, issues, and health.", inputSchema: object(project, ["project"]) },
      { name: "research_evidence_create", description: "Create a provenance-linked evidence card inside a research project.", inputSchema: object({ ...project, source: text("Source record path in this project."), title: text("Evidence title."), excerpt: text("Exact source excerpt."), locator_kind: text("page, section, paragraph, timestamp, or quote."), locator_value: text("Exact locator text."), interpretation: text("Optional interpretation."), review_state: text("proposed, reviewed, or rejected.") }, ["project", "source", "title", "excerpt"]) },
      { name: "research_claim_create", description: "Create a claim with separate supporting, challenging, and contextual evidence relations.", inputSchema: object({ ...project, title: text("Claim title."), proposition: text("Claim proposition."), confidence: text("low, moderate, or high."), review_state: text("proposed, reviewed, or rejected."), supports: { type: "array", items: { type: "string" } }, challenges: { type: "array", items: { type: "string" } }, contextualizes: { type: "array", items: { type: "string" } }, limitations: { type: "array", items: { type: "string" } } }, ["project", "title", "proposition"]) },
      { name: "research_claim_link", description: "Link evidence to a claim as supporting, challenging, or contextualizing.", inputSchema: object({ ...project, claim: text("Claim path."), evidence: text("Evidence path."), relation: text("supports, challenges, or contextualizes.") }, ["project", "claim", "evidence", "relation"]) },
      { name: "research_audit", description: "Audit a research project and return actionable JSON findings.", inputSchema: object(project, ["project"]) },
      { name: "research_outline_create", description: "Create an evidence-backed outline preserving supporting, challenging, and contextual evidence provenance.", inputSchema: object({ ...project, claims: { type: "array", items: { type: "string" } } }, ["project", "claims"]) },
    ];
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    const project = requiredString(args.project);
    switch (name) {
      case "research_project_read": {
        const snapshot = await this.repository.loadProject(project);
        return JSON.stringify({ project: { path: snapshot.project.path, title: snapshot.project.title, question: snapshot.project.question, stage: snapshot.project.stage, status: snapshot.project.status }, sources: snapshot.sources, evidence: snapshot.evidence, claims: snapshot.claims, questions: snapshot.questions, documents: snapshot.documents, issues: snapshot.issues, health: snapshot.health });
      }
      case "research_audit": return JSON.stringify(auditProject(await this.repository.loadProject(project)));
      case "research_evidence_create": {
        const excerpt = requiredString(args.excerpt);
        if (!excerpt.trim()) throw new Error("Evidence excerpt must not be empty");
        const reviewState = args.review_state === undefined ? "proposed" : requiredString(args.review_state);
        if (!isReviewState(reviewState)) throw new Error(`Unsupported review state: ${reviewState}`);
        const locatorKind = optionalString(args.locator_kind) as SourceLocatorKind | undefined;
        const locatorValue = optionalString(args.locator_value);
        const interpretation = optionalString(args.interpretation);
        if (reviewState === "reviewed" && (!locatorKind || !locatorValue?.trim())) throw new Error("Reviewed evidence requires an exact locator kind and value");
        const record = await this.repository.createEvidence({ project, source: requiredString(args.source), title: requiredString(args.title), excerpt, reviewState, ...(locatorKind ? { locatorKind } : {}), ...(locatorValue ? { locatorValue } : {}), ...(interpretation ? { interpretation } : {}) });
        return JSON.stringify({ path: record.path });
      }
      case "research_claim_create": {
        const reviewState = args.review_state === undefined ? "proposed" : requiredString(args.review_state);
        if (!isReviewState(reviewState)) throw new Error(`Unsupported review state: ${reviewState}`);
        const record = await this.repository.createClaim({ project, title: requiredString(args.title), proposition: requiredString(args.proposition), reviewState, confidence: (optionalString(args.confidence) ?? "moderate") as "low" | "moderate" | "high", supports: strings(args.supports), challenges: strings(args.challenges), contextualizes: strings(args.contextualizes), limitations: strings(args.limitations) });
        return JSON.stringify({ path: record.path });
      }
      case "research_claim_link": {
        const relation = requiredString(args.relation) as EvidenceRelation;
        if (!["supports", "challenges", "contextualizes"].includes(relation)) throw new Error(`Unsupported evidence relation: ${relation}`);
        await this.repository.linkClaimEvidence(project, requiredString(args.claim), requiredString(args.evidence), relation);
        return JSON.stringify({ linked: true });
      }
      case "research_outline_create": return JSON.stringify(await this.repository.createOutline(project, strings(args.claims)));
      default: throw new Error(`Unknown research tool: ${name}`);
    }
  }
}

function requiredString(value: unknown): string { if (typeof value !== "string") throw new Error("Expected a string argument"); return value; }
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
