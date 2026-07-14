import { describe, expect, it, vi } from "vitest";
import { DiscoveryCoordinator, type DiscoveryCoordinatorDeps } from "../../src/discovery/coordinator";
import { buildProjectSnapshot } from "../../src/research/graph";
import type { ResearchRecord } from "../../src/research/types";

const work = (id: string, extra: Record<string, unknown> = {}) => ({
  adapter: "openalex" as const, externalId: id, openAlexId: id, title: `Paper ${id}`, authors: ["Ada"], ...extra,
});

function snapshot(question = "How does discovery work?") {
  const records: ResearchRecord[] = [
    { path: "Research/P/Project.md", title: "P", type: "research-project", project: "Research/P/Project.md", question, stage: "frame", status: "active" },
  ];
  return buildProjectSnapshot("Research/P/Project.md", records, []);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(overrides: Partial<DiscoveryCoordinatorDeps> = {}) {
  const imports: unknown[] = [];
  const deps: DiscoveryCoordinatorDeps = {
    openAlex: { search: vi.fn(async () => ({ items: [work("W1", { doi: "10.1/x" })], nextCursor: "next" })), expand: vi.fn(async ({ direction }) => ({ items: [work("W2")], nextCursor: direction })) },
    crossref: { lookupDoi: vi.fn(async () => ({ adapter: "crossref", externalId: "10.1/x", doi: "10.1/x", title: "Enriched", authors: ["Ada"] })) },
    arxiv: { lookup: vi.fn(async () => undefined) },
    repository: { importSource: vi.fn(async (_path, input) => { imports.push(input); return { kind: "created" as const, path: "Sources/X.md" }; }) },
    resolveRerankProvider: () => undefined,
    now: () => new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
  return { deps, coordinator: new DiscoveryCoordinator(deps), imports };
}

describe("DiscoveryCoordinator", () => {
  it("derives idle state without HTTP or repository work", () => {
    const h = harness();
    expect(h.coordinator.stateFor(snapshot())).toEqual(expect.objectContaining({ status: "idle", query: { text: "How does discovery work?", projectPath: "Research/P/Project.md" } }));
    expect(h.deps.openAlex.search).not.toHaveBeenCalled();
    expect(h.deps.repository.importSource).not.toHaveBeenCalled();
  });

  it("searches explicitly, enriches partially, ranks, and never writes", async () => {
    const h = harness({ crossref: { lookupDoi: vi.fn(async () => { throw new Error("<html>secret</html>"); }) } });
    const state = await h.coordinator.search(snapshot(), "explicit query");
    expect(state).toEqual(expect.objectContaining({ status: "ready", partialAdapters: ["crossref"], cursor: "next" }));
    if (state.status !== "ready") throw new Error("expected ready");
    expect(state.ranked).toHaveLength(1);
    expect(state.deterministicOrder).toEqual(["doi:10.1/x"]);
    expect(h.deps.openAlex.search).toHaveBeenCalledTimes(1);
    expect(h.deps.repository.importSource).not.toHaveBeenCalled();
  });

  it("keeps late same-key results stale and caches cross-key results under their own keys", async () => {
    const first = deferred<{ items: ReturnType<typeof work>[] }>();
    const second = deferred<{ items: ReturnType<typeof work>[] }>();
    const search = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const h = harness({ openAlex: { search, expand: vi.fn() } });
    const a = h.coordinator.search(snapshot(), "one");
    const b = h.coordinator.search(snapshot(), "one");
    second.resolve({ items: [work("new")] });
    expect((await b).status).toBe("ready");
    first.resolve({ items: [work("old")] });
    expect((await a).status).toBe("stale");
    expect((h.coordinator.stateFor(snapshot()) as { ranked?: Array<{ candidate: { title: string } }> }).ranked?.[0]?.candidate.title).toBe("Paper new");

    const c = h.coordinator.search(snapshot(), "other");
    await c;
    expect(h.coordinator.stateFor(snapshot()).status).toBe("ready");
  });

  it.each(["references", "cited-by"] as const)("expands exactly one hop with %s provenance", async (direction) => {
    const h = harness();
    const searched = await h.coordinator.search(snapshot(), "q");
    if (searched.status !== "ready") throw new Error("expected ready");
    const expanded = await h.coordinator.expand(snapshot(), searched.ranked[0]!.candidate.id, direction);
    if (expanded.status !== "ready") throw new Error("expected ready");
    expect(h.deps.openAlex.expand).toHaveBeenCalledWith({ seedOpenAlexId: "W1", direction }, expect.any(AbortSignal));
    expect(expanded.ranked[0]!.candidate.relationship).toEqual({ seedId: searched.ranked[0]!.candidate.id, direction, adapter: "openalex" });
  });

  it("uses exact-set reranking and preserves results on provider failure", async () => {
    const provider = { id: "anthropic" as const, complete: vi.fn(async () => '{"order":[{"id":"openalex:W1","reason":"Only"}]}') };
    const h = harness({ openAlex: { search: vi.fn(async () => ({ items: [work("W1")] })), expand: vi.fn() }, resolveRerankProvider: () => ({ provider: provider as never, model: "explicit" }) });
    await h.coordinator.search(snapshot(), "q");
    const reranked = await h.coordinator.rerank(snapshot());
    expect(reranked).toEqual(expect.objectContaining({ status: "ready", modelOrder: ["openalex:W1"] }));
    provider.complete.mockRejectedValueOnce(new Error("credential secret"));
    const fallback = await h.coordinator.rerank(snapshot());
    expect(fallback).toEqual(expect.objectContaining({ status: "failed", message: "The discovery rerank could not be completed.", previous: expect.objectContaining({ modelOrder: ["openalex:W1"] }) }));
  });

  it("imports metadata only with duplicate-safe per-item outcomes", async () => {
    const importSource = vi.fn().mockResolvedValueOnce({ kind: "created", path: "A.md" }).mockResolvedValueOnce({ kind: "duplicate", path: "A.md" }).mockRejectedValueOnce(new Error("private"));
    const h = harness({ openAlex: { search: vi.fn(async () => ({ items: [work("A"), work("B"), work("C")] })), expand: vi.fn() }, repository: { importSource } });
    const ready = await h.coordinator.search(snapshot(), "q");
    if (ready.status !== "ready") throw new Error("expected ready");
    const outcomes = await h.coordinator.importCandidates(snapshot(), ready.ranked.map(({ candidate }) => candidate.id));
    expect(outcomes.map(({ status }) => status)).toEqual(["created", "duplicate", "failed"]);
    expect(importSource.mock.calls[0]?.[1]).not.toHaveProperty("capturedContent");
  });

  it("dismisses a result only from derived session state", async () => {
    const h = harness();
    const ready = await h.coordinator.search(snapshot(), "q");
    if (ready.status !== "ready") throw new Error("expected ready");
    h.coordinator.dismiss(ready.ranked[0]!.candidate.id);
    expect((h.coordinator.stateFor(snapshot()) as { ranked: unknown[] }).ranked).toEqual([]);
    expect(h.deps.repository.importSource).not.toHaveBeenCalled();
  });

  it("supports dismissal, cancellation, subscriptions, snapshot staleness, and cache clearing", async () => {
    const pending = deferred<{ items: ReturnType<typeof work>[] }>();
    const h = harness({ openAlex: { search: vi.fn(() => pending.promise), expand: vi.fn() } });
    const listener = vi.fn();
    const unsubscribe = h.coordinator.subscribe(listener);
    const request = h.coordinator.search(snapshot(), "q");
    h.coordinator.cancel();
    pending.resolve({ items: [work("W1")] });
    expect((await request).status).toBe("stale");
    expect(h.coordinator.stateFor(snapshot("changed")).status).toBe("stale");
    h.coordinator.clearCache();
    expect(h.coordinator.stateFor(snapshot()).status).toBe("idle");
    unsubscribe();
    const before = listener.mock.calls.length;
    h.coordinator.dismiss("missing");
    expect(listener).toHaveBeenCalledTimes(before);
  });
});
