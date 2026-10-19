import { describe, expect, it, vi } from "vitest";
import { FakeElement, type App } from "obsidian";
import { LivingSources } from "../../src/living/feature";
import { readBinding } from "../../src/living/view";
import { linkingApp } from "../context/typedVault";

const ARTICLE = "---\ntype: article\ntitle: Tide Study\n---\n# Tide Study\n\nThe moon pulls the oceans and creates two tides a day.";
const VIEW = "Claude/Artifacts/Living views/Tide Study — argument map.md";
const element = (): HTMLElement => new FakeElement() as unknown as HTMLElement;
const state = (el: HTMLElement): string => el.querySelector(".cc-living-state")?.textContent ?? "";
const map = (thesis: string): string => JSON.stringify({ thesis, claims: [{ claim: "Two tides a day.", evidence: [], objections: [] }], takeaway: "" });

function setup(replies: Array<string | Error>) {
  const app = linkingApp() as App & { vault: { seed: (p: string, c: string, o?: object) => unknown; frontmatters: Map<string, Record<string, unknown>> } };
  app.vault.seed("Sources/Tide Study.md", ARTICLE, { frontmatter: { type: "article", title: "Tide Study" } });
  const openFile = vi.fn(async () => undefined);
  (app as unknown as { workspace: unknown }).workspace = { getLeaf: () => ({ openFile }) };
  const complete = vi.fn(async () => {
    const next = replies.shift() ?? new Error("no reply queued");
    if (next instanceof Error) throw next;
    return next;
  });
  const living = new LivingSources({
    app,
    folder: () => "Claude/Artifacts",
    selection: async () => ({ provider: { complete } as never, model: "m" }),
    now: () => new Date("2026-10-19T14:00:00.000Z"),
  });
  const source = app.vault.getAbstractFileByPath("Sources/Tide Study.md") as never;
  const viewText = async (): Promise<string> => app.vault.read(app.vault.getAbstractFileByPath(VIEW) as never);
  /** The metadata cache entry Obsidian would hold for the written view note. */
  const indexView = (): void => {
    app.vault.frontmatters.set(VIEW, { living_kind: "argument-map", living_source: "[[Sources/Tide Study]]" });
  };
  return { app, living, source, complete, openFile, viewText, indexView };
}

describe("LivingSources", () => {
  it("builds an article's argument map once and reopens it without another model call", async () => {
    const t = setup([map("Lunar gravity drives the tides.")]);
    expect(t.living.kindOf(t.source)).toBe("argument-map");
    await t.living.open(t.source);
    const text = await t.viewText();
    expect(readBinding(text)).toMatchObject({ source: "Sources/Tide Study", kind: "argument-map", generated: "2026-10-19T14:00:00.000Z" });
    expect(text).toContain("Lunar gravity drives the tides.");
    expect(t.openFile).toHaveBeenLastCalledWith(t.app.vault.getAbstractFileByPath(VIEW), { state: { mode: "preview" } });
    t.indexView();
    await t.living.open(t.source);
    expect(t.complete).toHaveBeenCalledTimes(1);
    expect(t.openFile).toHaveBeenCalledTimes(2);
  });

  it("rebuilds a stale view when its status renders, and waits for Retry after a failed rebuild", async () => {
    const t = setup([map("First."), new Error("provider down"), map("Second.")]);
    await t.living.open(t.source);
    t.indexView();
    await t.app.vault.modify(t.source, `${ARTICLE}\n\nSpring tides happen at new and full moon.`);

    const first = element();
    t.living.renderStatus(first, VIEW);
    await vi.waitFor(() => expect(state(first)).toContain("rebuild failed: provider down"));
    expect(t.complete).toHaveBeenCalledTimes(2);

    const again = element();
    t.living.renderStatus(again, VIEW);
    const retry = (): FakeElement | undefined => again.querySelectorAll("button")[0] as unknown as FakeElement | undefined;
    await vi.waitFor(() => expect(retry()?.textContent).toBe("Retry"));
    expect(t.complete).toHaveBeenCalledTimes(2);

    retry()!.dispatchEvent({ type: "click", preventDefault() {} } as never);
    await vi.waitFor(async () => expect(await t.viewText()).toContain("Second."));
    await vi.waitFor(() => expect(state(again)).toContain("Up to date"));
    const fresh = element();
    t.living.renderStatus(fresh, VIEW);
    await vi.waitFor(() => expect(state(fresh)).toContain("Up to date"));
    expect(t.complete).toHaveBeenCalledTimes(3);
  });

  it("builds a dataset explorer from its CSV without a model call and offers nothing for other notes", async () => {
    const t = setup([]);
    t.app.vault.seed("Data/prices.csv", "item,price\nApple,3\n");
    t.app.vault.seed("Data/Prices.md", "# Prices", { frontmatter: { type: "dataset", title: "Prices", asset: "Data/prices.csv" } });
    t.app.vault.seed("Notes/Plain.md", "# Plain", { frontmatter: { type: "person" } });
    await t.living.open(t.app.vault.getAbstractFileByPath("Data/Prices.md") as never);
    const view = await t.app.vault.read(t.app.vault.getAbstractFileByPath("Claude/Artifacts/Living views/Prices — dataset explorer.md") as never);
    expect(view).toContain('"rows":[["Apple","3"]]');
    expect(t.complete).not.toHaveBeenCalled();
    expect(t.living.kindOf(t.app.vault.getAbstractFileByPath("Notes/Plain.md") as never)).toBeNull();
  });
});
