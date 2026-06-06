import { setIcon, Notice, Modal, App } from "obsidian";
import { validateArtifactInteractivity } from "./parse";
import type { ArtifactOpenTarget } from "../types";

/** Sandbox CSP shared by the inline iframe and the fullscreen modal: scripts run
 *  but can't reach the vault, cookies, forms, or the network. */
const ARTIFACT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; " +
  "form-action 'none'; base-uri 'none';";

function sandboxFrame(iframe: HTMLIFrameElement, html: string): void {
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("csp", ARTIFACT_CSP);
  iframe.srcdoc = html;
}

export interface ArtifactActions {
  /** Open externally (browser), honoring the user's artifact-open setting. */
  openExternal?: (html: string, title: string) => void;
  /** Open full-window inside Obsidian. */
  openFullscreen?: (html: string, title: string) => void;
}

/**
 * Render an HTML artifact inline inside a note using a sandboxed iframe.
 *
 * The iframe is sandboxed WITHOUT `allow-same-origin` and gets a restrictive
 * CSP, so artifact scripts can run (charts, toggles, interactions) but cannot
 * read cookies, reach the vault, submit forms, or call out to the network.
 */
export function renderArtifactInline(
  el: HTMLElement,
  html: string,
  height: number,
  title: string,
  actions: ArtifactActions = {},
): void {
  const wrap = el.createDiv({ cls: "cc-artifact" });

  const bar = wrap.createDiv({ cls: "cc-artifact-bar" });
  const label = bar.createDiv({ cls: "cc-artifact-label" });
  setIcon(label.createSpan({ cls: "cc-artifact-icon" }), "layout-dashboard");
  label.createSpan({ text: title });

  const fsBtn = bar.createEl("button", { cls: "cc-artifact-btn", attr: { "aria-label": "Open full screen in Obsidian" } });
  setIcon(fsBtn, "maximize-2");
  fsBtn.addEventListener("click", () => (actions.openFullscreen ?? ((h, t) => void openArtifactExternally(h, t)))(html, title));

  const openBtn = bar.createEl("button", { cls: "cc-artifact-btn cc-artifact-open", attr: { "aria-label": "Open in browser" } });
  openBtn.setText("Open ↗");
  openBtn.addEventListener("click", () => (actions.openExternal ?? ((h, t) => void openArtifactExternally(h, t)))(html, title));

  const iframe = wrap.createEl("iframe", { cls: "cc-artifact-frame" });
  sandboxFrame(iframe, html);
  iframe.setAttribute("loading", "lazy");
  iframe.style.height = `${Math.max(120, height)}px`;

  // Flag faux-interactive artifacts (handlers wired to undefined JS) — a model
  // regression guard, so a tab bar that does nothing doesn't ship silently.
  const report = validateArtifactInteractivity(html);
  if (!report.ok) console.warn("[Claude Companion] artifact interactivity issues:", report.issues);
}

/**
 * A full-window, sandboxed view of an artifact inside Obsidian — the
 * "keep everything in one app" path (the default open target).
 */
export class ArtifactModal extends Modal {
  constructor(
    app: App,
    private html: string,
    private artifactTitle: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("cc-artifact-modal");
    this.titleEl.setText(this.artifactTitle || "Artifact");
    const iframe = this.contentEl.createEl("iframe", { cls: "cc-artifact-frame cc-artifact-frame-full" });
    sandboxFrame(iframe, this.html);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** macOS .app names for the browsers we offer. */
const BROWSER_APP: Record<string, string> = {
  chrome: "Google Chrome",
  safari: "Safari",
  brave: "Brave Browser",
  firefox: "Firefox",
};

/**
 * Open an artifact in an external browser. "default" uses the OS default; a
 * named browser is launched via `open -a` on macOS, falling back to the default
 * if that browser isn't installed or we're not on macOS. Blob URLs / window.open
 * are unreliable in Obsidian's Electron renderer, so we write a temp file and
 * hand it to the OS shell.
 */
export async function openArtifactExternally(html: string, title: string, target: ArtifactOpenTarget = "default"): Promise<void> {
  try {
    const req = (globalThis as { require?: (m: string) => unknown }).require;
    if (!req) throw new Error("native modules unavailable");
    const os = req("os") as { tmpdir(): string; platform(): string };
    const path = req("path") as { join(...p: string[]): string };
    const fs = req("fs") as { promises: { writeFile(p: string, d: string, enc: string): Promise<void> } };
    const electron = req("electron") as { shell: { openPath(p: string): Promise<string> } };

    const safe = (title || "artifact").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "artifact";
    const file = path.join(os.tmpdir(), `companion-${safe}-${Date.now()}.html`);
    await fs.promises.writeFile(file, html, "utf8");

    const appName = target !== "default" && target !== "obsidian" ? BROWSER_APP[target] : undefined;
    if (appName && os.platform() === "darwin") {
      const cp = req("child_process") as { exec(cmd: string, cb: (err: unknown) => void): void };
      await new Promise<void>((resolve) => {
        cp.exec(`open -a ${JSON.stringify(appName)} ${JSON.stringify(file)}`, (err) => {
          if (err) void electron.shell.openPath(file); // browser not installed → default
          resolve();
        });
      });
      return;
    }

    const err = await electron.shell.openPath(file);
    if (err) throw new Error(err);
  } catch (e) {
    try {
      window.open(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, "_blank");
    } catch {
      new Notice(`Couldn't open the artifact externally: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
