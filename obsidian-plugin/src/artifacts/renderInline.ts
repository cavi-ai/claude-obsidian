import { setIcon, Notice } from "obsidian";

/**
 * Render an HTML artifact inline inside a note using a sandboxed iframe.
 *
 * The iframe is sandboxed WITHOUT `allow-same-origin` and gets a restrictive
 * CSP, so artifact scripts can run (charts, toggles, interactions) but cannot
 * read cookies, reach the vault, submit forms, or call out to the network.
 */
export function renderArtifactInline(el: HTMLElement, html: string, height: number, title: string): void {
  const wrap = el.createDiv({ cls: "cc-artifact" });

  const bar = wrap.createDiv({ cls: "cc-artifact-bar" });
  const label = bar.createDiv({ cls: "cc-artifact-label" });
  setIcon(label.createSpan({ cls: "cc-artifact-icon" }), "layout-dashboard");
  label.createSpan({ text: title });

  const openBtn = bar.createEl("button", { cls: "cc-artifact-open", attr: { "aria-label": "Open artifact in your browser" } });
  openBtn.setText("Open ↗");
  openBtn.addEventListener("click", () => void openArtifactInBrowser(html, title));

  const iframe = wrap.createEl("iframe", { cls: "cc-artifact-frame" });
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute(
    "csp",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none';",
  );
  iframe.setAttribute("loading", "lazy");
  iframe.style.height = `${Math.max(120, height)}px`;
  iframe.srcdoc = html;
}

/**
 * Open an artifact in the user's real browser. Blob URLs and `window.open`
 * are unreliable inside Obsidian's Electron renderer, so we write the HTML to a
 * temp file and hand it to the OS via Electron's shell. Falls back to a new tab
 * if the shell isn't reachable.
 */
async function openArtifactInBrowser(html: string, title: string): Promise<void> {
  try {
    // Node/Electron builtins — external in the bundle and present at runtime in
    // Obsidian's desktop environment. Resolved via require so we don't need
    // @types/node's "electron" declaration, and lazily so a failure here never
    // breaks inline rendering.
    const req = (globalThis as { require?: (m: string) => unknown }).require;
    if (!req) throw new Error("native modules unavailable");
    const os = req("os") as { tmpdir(): string };
    const path = req("path") as { join(...p: string[]): string };
    const fs = req("fs") as { promises: { writeFile(p: string, d: string, enc: string): Promise<void> } };
    const electron = req("electron") as { shell: { openPath(p: string): Promise<string> } };

    const safe = (title || "artifact").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "artifact";
    const file = path.join(os.tmpdir(), `companion-${safe}-${Date.now()}.html`);
    await fs.promises.writeFile(file, html, "utf8");
    const err = await electron.shell.openPath(file);
    if (err) throw new Error(err);
  } catch (e) {
    // Last resort: a sandboxed data-URL tab. Better than silently doing nothing.
    try {
      window.open(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, "_blank");
    } catch {
      new Notice(`Couldn't open the artifact externally: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
