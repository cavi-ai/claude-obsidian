// Living views for typed source notes: build a bound view note, open it, and
// keep it current. A view whose source changed shows so and rebuilds when it is
// displayed; a failed rebuild waits for Retry instead of trying again.

import { type App, Notice, TFile } from "obsidian";
import { errorMessage } from "../records";
import { completeJsonWithRepair } from "../providers/jsonRepair";
import type { ProviderSelection } from "../providers/router";
import { ensureVaultFolder, uniqueNotePath } from "../vault/vaultFiles";
import { ARGUMENT_MAP_SCHEMA, ARGUMENT_MAP_SYSTEM, argumentMapPrompt, parseArgumentMap, renderArgumentMap, type ArticleInput } from "./argumentMap";
import { parseCsv, renderDatasetExplorer } from "./datasetExplorer";
import { fingerprint } from "./fingerprint";
import { KIND_LABEL, buildViewNote, defaultViewPath, livingKindFor, noteBody, readBinding, type LivingKind } from "./view";

export interface LivingSourcesDeps {
  app: App;
  /** Folder that holds the "Living views" folder (the artifact folder). */
  folder(): string;
  /** The model for argument maps; may ask for consent. */
  selection(): Promise<ProviderSelection>;
  now?(): Date;
}

export class LivingSources {
  private readonly building = new Map<string, Promise<TFile>>();
  /** View path → the source fingerprint whose rebuild failed, so it is not retried on every render. */
  private readonly failed = new Map<string, { hash: string; message: string }>();

  constructor(private readonly deps: LivingSourcesDeps) {}

  private get app(): App {
    return this.deps.app;
  }

  /** The view a note gets, or null when it is not an article or a dataset with a CSV. */
  kindOf(file: TFile): LivingKind | null {
    if (file.extension !== "md") return null;
    return livingKindFor(this.app.metadataCache.getFileCache(file)?.frontmatter);
  }

  /** Open the source's view, building it first when it is missing or out of date. */
  async open(source: TFile): Promise<void> {
    const kind = this.kindOf(source);
    if (!kind) {
      new Notice("Living views are available for article notes and dataset notes with a CSV.");
      return;
    }
    try {
      let view = this.viewFor(source, kind);
      const current = await this.sourceFingerprint(source, kind);
      const binding = view ? readBinding(await this.app.vault.read(view)) : null;
      if (!view || binding?.hash !== current) {
        if (kind === "argument-map") new Notice(`Building the ${KIND_LABEL[kind]} for ${source.basename}…`);
        view = await this.rebuild(source, kind, view);
      }
      await this.app.workspace.getLeaf(false).openFile(view, { state: { mode: "preview" } });
    } catch (error) {
      new Notice(`Couldn't build the living view: ${errorMessage(error)}`);
    }
  }

  /** Status row for a view note: its source, whether it is current, and Rebuild/Retry. */
  renderStatus(el: HTMLElement, viewPath: string): void {
    this.refresh(el.createDiv({ cls: "cc-living-status" }), viewPath);
  }

  /** Redraw a status row in place; the reading view keeps a block whose text did not change. */
  private refresh(row: HTMLElement, viewPath: string): void {
    row.empty();
    void this.fillStatus(row, viewPath).catch((error: unknown) => row.setText(`Couldn't check this living view: ${errorMessage(error)}`));
  }

  private async fillStatus(row: HTMLElement, viewPath: string): Promise<void> {
    const view = this.app.vault.getAbstractFileByPath(viewPath);
    if (!(view instanceof TFile)) return;
    const binding = readBinding(await this.app.vault.read(view));
    if (!binding) {
      row.setText("This note is missing its living view source.");
      return;
    }
    const source = this.app.metadataCache.getFirstLinkpathDest(binding.source, view.path);
    if (!source) {
      row.createSpan({ cls: "cc-living-state is-stale", text: `Source note not found: ${binding.source}` });
      return;
    }
    const link = row.createEl("a", { cls: "cc-living-source", text: source.basename, href: "#" });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void this.app.workspace.getLeaf(false).openFile(source);
    });
    const current = await this.sourceFingerprint(source, binding.kind);
    const state = row.createSpan({ cls: "cc-living-state" });
    const button = (label: string): void => {
      const b = row.createEl("button", { cls: "cc-living-action", text: label });
      b.addEventListener("click", () => {
        this.failed.delete(view.path);
        b.disabled = true;
        state.setText("Rebuilding…");
        void this.rebuild(source, binding.kind, view).then(
          () => this.refresh(row, view.path),
          (error: unknown) => {
            state.setText(`Rebuild failed: ${errorMessage(error)}`);
            b.disabled = false;
          },
        );
      });
    };
    if (current === binding.hash) {
      const built = Date.parse(binding.generated);
      state.setText(`Up to date${Number.isNaN(built) ? "" : ` · built ${new Date(built).toLocaleString()}`}`);
      button("Rebuild");
      return;
    }
    state.addClass("is-stale");
    const failure = this.failed.get(view.path);
    if (failure?.hash === current) {
      state.setText(`Source changed · rebuild failed: ${failure.message}`);
      button("Retry");
      return;
    }
    state.setText("Source changed · rebuilding…");
    try {
      await this.rebuild(source, binding.kind, view);
      this.refresh(row, view.path);
    } catch (error) {
      this.failed.set(view.path, { hash: current, message: errorMessage(error) });
      state.setText(`Source changed · rebuild failed: ${errorMessage(error)}`);
      button("Retry");
    }
  }

  /** The view note bound to this source and kind, wherever it was renamed to. */
  private viewFor(source: TFile, kind: LivingKind): TFile | null {
    const folder = defaultViewPath(this.deps.folder(), source.basename, kind).replace(/\/[^/]*$/, "/");
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(folder)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.living_kind !== kind || typeof fm.living_source !== "string") continue;
      const link = /^\[\[([^\]|#]+)/.exec(fm.living_source)?.[1];
      if (link && this.app.metadataCache.getFirstLinkpathDest(link, file.path)?.path === source.path) return file;
    }
    return null;
  }

  /** Build the view and write it; concurrent rebuilds of one source share a run. */
  private rebuild(source: TFile, kind: LivingKind, existing: TFile | null): Promise<TFile> {
    const key = `${source.path}\u0000${kind}`;
    const running = this.building.get(key);
    if (running) return running;
    const run = (async () => {
      const note = await this.build(source, kind);
      if (existing && this.app.vault.getAbstractFileByPath(existing.path) === existing) {
        await this.app.vault.modify(existing, note);
        this.failed.delete(existing.path);
        return existing;
      }
      const path = defaultViewPath(this.deps.folder(), source.basename, kind);
      const folder = path.slice(0, path.lastIndexOf("/"));
      await ensureVaultFolder(this.app, folder);
      const base = path.slice(folder.length + 1, -".md".length);
      return this.app.vault.create(await uniqueNotePath(this.app, folder, base, "md"), note);
    })().finally(() => this.building.delete(key));
    this.building.set(key, run);
    return run;
  }

  /** The view note text for the source as it is now. */
  private async build(source: TFile, kind: LivingKind): Promise<string> {
    const fm = this.app.metadataCache.getFileCache(source)?.frontmatter ?? {};
    const title = typeof fm.title === "string" && fm.title.trim() ? fm.title.trim() : source.basename;
    const binding = { source: source.path.replace(/\.md$/, ""), kind, generated: (this.deps.now?.() ?? new Date()).toISOString() };
    if (kind === "argument-map") {
      const text = noteBody(await this.app.vault.read(source));
      const input: ArticleInput = {
        title,
        text,
        ...(typeof fm.summary === "string" ? { summary: fm.summary } : {}),
        ...(Array.isArray(fm.key_claims) ? { keyClaims: fm.key_claims.map(String) } : {}),
        ...(typeof fm.url === "string" ? { url: fm.url } : {}),
      };
      const selection = await this.deps.selection();
      const { response } = await completeJsonWithRepair(selection.provider, {
        system: ARGUMENT_MAP_SYSTEM,
        messages: [{ role: "user", content: argumentMapPrompt(input) }],
        model: selection.model,
        maxTokens: 2500,
        temperature: 0,
        responseFormat: "json",
        responseSchema: ARGUMENT_MAP_SCHEMA,
        thinking: { type: "disabled" },
      }, parseArgumentMap);
      const html = renderArgumentMap(response, input);
      return buildViewNote({ ...binding, title: `${title} — ${KIND_LABEL[kind]}`, hash: fingerprint(text), html });
    }
    const asset = this.assetOf(source);
    if (!asset) throw new Error(`The dataset's CSV is not in the vault: ${String(fm.asset)}`);
    const csv = await this.app.vault.read(asset);
    const table = parseCsv(csv);
    if (!table) throw new Error(`${asset.path} has no header row`);
    const html = renderDatasetExplorer(table, { title, asset: asset.path });
    return buildViewNote({ ...binding, title: `${title} — ${KIND_LABEL[kind]}`, hash: fingerprint(csv), html });
  }

  private assetOf(source: TFile): TFile | null {
    const asset: unknown = this.app.metadataCache.getFileCache(source)?.frontmatter?.asset;
    if (typeof asset !== "string" || !asset.trim()) return null;
    const direct = this.app.vault.getAbstractFileByPath(asset.trim());
    if (direct instanceof TFile) return direct;
    return this.app.metadataCache.getFirstLinkpathDest(asset.trim(), source.path);
  }

  /** What a view of this kind was built from: an article's body, a dataset's CSV. */
  private async sourceFingerprint(source: TFile, kind: LivingKind): Promise<string> {
    if (kind === "argument-map") return fingerprint(noteBody(await this.app.vault.read(source)));
    const asset = this.assetOf(source);
    if (!asset) throw new Error("The dataset's CSV is not in the vault");
    return fingerprint(await this.app.vault.read(asset));
  }
}
