import { setIcon } from "obsidian";

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

  const openBtn = bar.createEl("button", { cls: "cc-artifact-open", attr: { "aria-label": "Open artifact in a new window" } });
  openBtn.setText("Open ↗");
  openBtn.addEventListener("click", () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

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
