// Guided 3-step Provider Setup Wizard: choose provider, verify/configure with rollback safety, and finish.

import { App, Modal } from "obsidian";
import { DEVICE_MODELS, deviceModelCached } from "../device/models";
import {
  buildWizardProviderCards,
  CLI_IDS,
  CLI_INSTALL_HINTS,
  CLI_WIZARD_BACKENDS,
  cliProviderOf,
  cliSignInCommand,
  defaultWizardProvider,
  isCliWizardProvider,
  type WizardProviderId,
} from "../onboarding/providerWizard";
import type { ConnectionController } from "../providers/connection";
import { ProviderRouter, type CliBackendId } from "../providers/router";
import type { ProviderStatus } from "../providers/types";
import { sanitizeEndpointForDisplay } from "../providers/endpointPolicy";
import { OllamaProvider } from "../providers/ollama";
import { secretIdFor, type SecretStore } from "../secrets/store";
import type { PluginSettings } from "../types";
import { cliModelChoices } from "./cliModelChoices";

export interface ProviderSetupWizardDeps {
  settings(): PluginSettings;
  saveSettings(): Promise<void>;
  router(): ProviderRouter;
  connection(): ConnectionController;
  secrets(): SecretStore;
  testCandidate?(candidate: PluginSettings): Promise<ProviderStatus>;
  detectOllamaModels?(host: string, model: string): Promise<string[]>;
  refreshViews?(): void;
  openDesktopIntegrations?(): void;
  activateChat?(): void;
  isMobile?(): boolean;
}

interface WizardDrafts {
  step: 1 | 2 | 3;
  selected: WizardProviderId;
  closed: boolean;
  busy: boolean;
  probes: Set<string>;
  apiKey: string;
  oauth: string;
  authMode: PluginSettings["authMode"];
  ollamaHost: string;
  ollamaModel: string;
  epHost: string;
  epModel: string;
  epKey: string;
  deviceModel: string;
  cliModelDraft: Record<string, string>;
  summary: string;
}

const div = (p: HTMLElement, cls: string, attr?: Record<string, string>): HTMLElement =>
  p.createDiv({ cls, ...(attr ? { attr } : {}) });

const fail = (el: HTMLElement, msg: string): void => {
  el.addClass("is-err");
  el.setText(msg);
};

function makeBtn(p: HTMLElement, cls: string, text: string, onClick: () => void, aria?: string): HTMLButtonElement {
  const b = p.createEl("button", { cls, text, attr: { type: "button", ...(aria ? { "aria-label": aria } : {}) } });
  b.addEventListener("click", onClick);
  return b;
}

function makeInp(p: HTMLElement, label: string, cls: string, type: string, placeholder: string, val: string, onInput: (v: string) => void): HTMLInputElement {
  const row = div(p, "cc-wizard-field");
  row.createEl("label", { text: label });
  const inp = row.createEl("input", { cls, attr: { type, placeholder, "aria-label": label } });
  inp.value = val;
  inp.addEventListener("input", () => onInput(inp.value));
  return inp;
}

function makeSel(p: HTMLElement, label: string, cls: string, opts: Array<{ id: string; label: string }>, val: string, onChange: (v: string) => void): HTMLSelectElement {
  const row = div(p, "cc-wizard-field");
  row.createEl("label", { text: label });
  const sel = row.createEl("select", { cls, attr: { "aria-label": label } });
  for (const o of opts) sel.createEl("option", { text: o.label, attr: { value: o.id } });
  sel.value = val;
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

export class ProviderSetupWizardModal extends Modal {
  private readonly st: WizardDrafts;

  constructor(app: App, private readonly deps: ProviderSetupWizardDeps) {
    super(app);
    const s = deps.settings();
    const mobile = deps.isMobile?.() ?? false;
    this.st = {
      step: 1,
      selected: defaultWizardProvider(s, deps.router(), mobile),
      closed: false,
      busy: false,
      probes: new Set(),
      apiKey: s.apiKey,
      oauth: s.oauthToken,
      authMode: s.authMode,
      ollamaHost: s.ollamaHost || "http://localhost:11434",
      ollamaModel: s.ollamaModel || "llama3.1",
      epHost: s.openaiCompatHost,
      epModel: s.openaiCompatModel,
      epKey: s.openaiCompatKey,
      deviceModel: s.deviceChatModel || DEVICE_MODELS[0].id,
      cliModelDraft: {
        "codex-cli": s.codexModel,
        "agy-cli": s.agyModel,
        "opencode-cli": s.opencodeModel,
      },
      summary: "",
    };
  }

  override onOpen(): void {
    this.st.closed = false;
    this.modalEl.addClass("cc-provider-wizard-shell");
    this.paint();
    if (this.deps.isMobile?.()) return;
    const router = this.deps.router();
    for (const id of CLI_IDS) {
      const p = cliProviderOf(router, id);
      if (!p || p.hasCredentials() || !p.available?.() || this.st.probes.has(id)) continue;
      this.st.probes.add(id);
      void Promise.resolve(p.refresh?.()).catch(() => undefined).finally(() => {
        this.st.probes.delete(id);
        if (!this.st.closed && this.st.step === 1) this.paint();
      });
    }
  }

  override onClose(): void {
    this.st.closed = true;
    this.modalEl.removeClass("cc-provider-wizard-shell");
    this.contentEl.empty();
  }

  private paint(): void {
    const { st, contentEl, deps } = this;
    if (st.closed) return;
    contentEl.empty();
    contentEl.addClass("cc-provider-wizard");
    this.titleEl.setText(st.step === 3 ? "Companion connected — Step 3 of 3" : `Connect Companion — Step ${st.step} of 3`);

    const stepper = div(contentEl, "cc-wizard-stepper");
    for (const [n, label] of [[1, "1. Choose provider"], [2, "2. Configure & verify"], [3, "3. Ready to chat"]] as const) {
      const pill = stepper.createSpan({ cls: `cc-wizard-step-pill${st.step === n ? " is-active" : st.step > n ? " is-done" : ""}`, text: label });
      if (st.step === n) pill.setAttr("aria-current", "step");
    }

    if (st.step === 1) {
      const mobile = deps.isMobile?.() ?? false;
      contentEl.createEl("p", {
        cls: "cc-wizard-intro",
        text: mobile ? "Choose how Companion connects on this device." : "Choose a desktop CLI subscription, your own Anthropic API key, or a local model.",
      });
      const grid = div(contentEl, "cc-wizard-provider-grid", { role: "list" });
      for (const c of buildWizardProviderCards(deps.settings(), deps.router(), mobile)) {
        const btn = grid.createEl("button", {
          cls: `cc-wizard-provider-card${st.selected === c.id ? " is-selected" : ""}`,
          attr: { type: "button", "data-provider": c.id, "aria-pressed": String(st.selected === c.id) },
        });
        const head = div(btn, "cc-wizard-card-head");
        head.createSpan({ cls: "cc-wizard-card-title", text: c.label });
        head.createSpan({ cls: `cc-wizard-badge is-${c.badgeState}`, text: c.badgeText });
        div(btn, "cc-wizard-card-sub").setText(c.subtitle);
        div(btn, "cc-wizard-card-detail").setText(c.detail);
        btn.addEventListener("click", () => { st.selected = c.id; st.step = 2; this.paint(); });
      }
      makeBtn(div(contentEl, "cc-wizard-footer"), "mod-cta cc-wizard-next", "Continue", () => { st.step = 2; this.paint(); });
      return;
    }

    if (st.step === 3) {
      const summary = div(div(contentEl, "cc-wizard-body"), "cc-wizard-summary", { role: "status" });
      summary.createEl("h3", { text: "✓ Connected and ready" });
      summary.createEl("p", { text: st.summary || "Your chat provider is verified and active." });
      const footer = div(contentEl, "cc-wizard-footer");
      if (!(deps.isMobile?.() ?? false) && deps.openDesktopIntegrations) {
        makeBtn(footer, "cc-wizard-desktop-integrations", "Set up desktop & CLI vault tools…", () => { this.close(); deps.openDesktopIntegrations?.(); });
      }
      makeBtn(footer, "mod-cta cc-wizard-finish", "Start chatting", () => { this.close(); deps.refreshViews?.(); deps.activateChat?.(); });
      return;
    }

    const body = div(contentEl, "cc-wizard-body");
    const footer = div(contentEl, "cc-wizard-footer");
    makeBtn(footer, "cc-wizard-back", "Back", () => {
      if (st.busy) return;
      st.step = 1;
      this.paint();
    });

    const canCommit = (): boolean => !st.closed;
    const runAction = (statusEl: HTMLElement, waiting: string, work: () => Promise<void>): void => {
      if (st.busy || st.closed) return;
      const controls = [
        ...body.querySelectorAll<HTMLInputElement>("input"),
        ...body.querySelectorAll<HTMLSelectElement>("select"),
        ...footer.querySelectorAll<HTMLButtonElement>("button"),
      ];
      st.busy = true;
      for (const control of controls) control.disabled = true;
      statusEl.removeClass("is-ok", "is-err");
      statusEl.setText(waiting);
      void work().catch((e: unknown) => {
        if (!st.closed) fail(statusEl, e instanceof Error ? e.message : String(e));
      }).finally(() => {
        st.busy = false;
        if (!st.closed) for (const control of controls) control.disabled = false;
      });
    };

    const done = (msg: string): void => {
      st.summary = msg;
      st.step = 3;
      deps.refreshViews?.();
      this.paint();
    };

    const testCandidate = async (candidate: PluginSettings): Promise<ProviderStatus> => {
      if (deps.testCandidate) return deps.testCandidate(candidate);
      const router = new ProviderRouter(candidate);
      if (candidate.chatBackend === "local") return router.ollama.test(candidate.ollamaModel);
      if (candidate.chatBackend === "custom") return router.openaiCompat.test(candidate.openaiCompatModel);
      return router.device.test();
    };

    const testAndCommit = async (
      statusEl: HTMLElement,
      candidateOverrides: Partial<PluginSettings>,
      backend: PluginSettings["chatBackend"],
      summaryMsg: string,
    ): Promise<void> => {
      const current = deps.settings();
      const changes = { ...candidateOverrides, chatBackend: backend };
      const keys = Object.keys(changes) as Array<keyof PluginSettings>;
      const previous = Object.fromEntries(keys.map((key) => [key, current[key]]));
      const candidate = { ...current, ...changes };
      const res = await testCandidate(candidate);
      if (st.closed) return;
      if (!res.ok) {
        fail(statusEl, res.detail);
        return;
      }
      if (backend === "device" && !await deviceModelCached(candidate.deviceChatModel, window.caches)) {
        if (!st.closed) fail(statusEl, "In Companion settings → Connection, choose On-device GPU as the chat backend, then select and download this model.");
        return;
      }
      if (st.closed) return;
      if (current !== deps.settings() || keys.some((key) => current[key] !== previous[key])) {
        fail(statusEl, "The connection changed while checking it. Try again.");
        return;
      }
      const store = deps.secrets();
      const keyId = secretIdFor("openaiCompatKey");
      const restoreKey = changes.openaiCompatKey !== undefined && store.available();
      const storedBefore = restoreKey ? store.get(keyId) ?? "" : "";
      Object.assign(current, changes);
      try {
        await deps.saveSettings();
      } catch (error) {
        Object.assign(current, previous);
        const restoredSettings = await deps.saveSettings().then(() => true, () => false);
        if (restoreKey && (store.get(keyId) ?? "") !== storedBefore && !store.set(keyId, storedBefore)) {
          throw new Error("Could not restore the previous endpoint key. Check Obsidian secret storage.", { cause: error });
        }
        if (!restoredSettings) {
          throw new Error("Could not save or restore the connection settings. Check storage and retry.", { cause: error });
        }
        throw error;
      }
      if (!st.closed) done(summaryMsg);
    };

    if (isCliWizardProvider(st.selected)) {
      const id: CliBackendId = st.selected;
      const b = CLI_WIZARD_BACKENDS[id];
      const p = cliProviderOf(deps.router(), id);
      const ok = p?.hasCredentials?.() === true;
      const probe = p?.probe?.() ?? null;
      const cmd = cliSignInCommand(b);
      body.createEl("h3", { text: b.label });
      const statusEl = div(body, `cc-wizard-status ${ok ? "is-ok" : "is-err"}`, { role: "status" });
      if (ok) {
        statusEl.setText(probe?.version ? `✓ ${b.label} ${probe.version} is signed in and ready (${probe.executable}).` : `✓ ${b.label} is signed in and ready.`);
        if (id !== "claude-cli") {
          const key = id === "codex-cli" ? "codexModel" : id === "agy-cli" ? "agyModel" : "opencodeModel";
          const currentVal = st.cliModelDraft[id] ?? deps.settings()[key];
          const sel = makeSel(body, `${b.label} model`, "cc-wizard-model-select", cliModelChoices([], currentVal, b.label), currentVal, (v) => { st.cliModelDraft[id] = v; });
          void p?.listModels?.().then((m) => {
            if (st.closed || st.step !== 2 || st.selected !== id) return;
            sel.empty();
            const valNow = st.cliModelDraft[id] ?? deps.settings()[key];
            for (const ch of cliModelChoices(m, valNow, b.label)) sel.createEl("option", { text: ch.label, attr: { value: ch.id } });
            sel.value = valNow;
          }).catch(() => undefined);
        }
      } else {
        statusEl.setText(probe ? `${b.label} is installed (${probe.executable}), but not signed in. ${b.signInHint[0]!.toUpperCase()}${b.signInHint.slice(1)} in your terminal, then click Re-check.` : `${b.label} (${b.binary}) was not found. ${CLI_INSTALL_HINTS[id]}`);
        const box = div(body, "cc-wizard-cmd-box");
        box.createEl("code", { cls: "cc-wizard-cmd-code", text: cmd });
        const copyBtn = makeBtn(box, "cc-wizard-copy-cmd", "Copy command", () => {
          void navigator.clipboard?.writeText?.(cmd);
          copyBtn.setText("Copied");
          window.setTimeout(() => { if (!st.closed && copyBtn.isConnected) copyBtn.setText("Copy command"); }, 1200);
        }, `Copy ${b.label} command`);
      }

      const connectCli = async (): Promise<void> => {
        const res = await deps.connection().connect({ backend: id, canCommit });
        if (!st.closed) {
          if (res.ok) {
            if (id !== "claude-cli") {
              const key = id === "codex-cli" ? "codexModel" : id === "agy-cli" ? "agyModel" : "opencodeModel";
              const draftModel = st.cliModelDraft[id];
              if (draftModel !== undefined) {
                deps.settings()[key] = draftModel;
                await deps.saveSettings();
              }
            }
            if (!st.closed) done(`${b.label} connected.`);
          } else {
            fail(statusEl, res.detail);
          }
        }
      };

      makeBtn(footer, ok ? "cc-wizard-recheck" : "mod-cta cc-wizard-recheck", "Re-check", () => {
        if (!p) return;
        runAction(statusEl, `Checking ${b.label}…`, async () => {
          const check: ProviderStatus = await p.refresh();
          if (st.closed) return;
          if (p.hasCredentials()) await connectCli();
          else {
            st.busy = false;
            this.paint();
            const cur = contentEl.querySelector<HTMLElement>(".cc-wizard-status");
            if (cur && check?.detail) fail(cur, check.detail);
          }
        });
      });

      if (ok) {
        makeBtn(footer, "mod-cta cc-wizard-connect", `Use ${b.label}`, () => {
          runAction(statusEl, "Connecting…", connectCli);
        });
      }
      return;
    }

    if (st.selected === "claude") {
      body.createEl("h3", { text: "Claude API" });
      makeSel(body, "Authentication mode", "cc-wizard-auth-mode", [
        { id: "apiKey", label: "API key (recommended)" },
        { id: "oauthToken", label: "Long-term OAuth token (subscription)" },
        { id: "environment", label: "Import from environment" },
      ], st.authMode, (mode) => {
        if (st.busy || (mode !== "apiKey" && mode !== "oauthToken" && mode !== "environment")) return;
        st.authMode = mode;
        this.paint();
      });
      const isOAuth = st.authMode === "oauthToken";
      const isEnvironment = st.authMode === "environment";
      if (isEnvironment) {
        body.createEl("p", { text: "Uses ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN from Obsidian’s process environment." });
      }
      const inp = isEnvironment ? null : makeInp(body, isOAuth ? "OAuth token" : "Anthropic API key", "cc-wizard-input", "password", isOAuth ? "sk-ant-oat…" : "sk-ant-api…", isOAuth ? st.oauth : st.apiKey, (v) => {
        if (isOAuth) st.oauth = v; else st.apiKey = v;
      });
      const statusEl = div(body, "cc-wizard-status", { role: "status" });
      const submit = (): void => {
        if (st.busy) return;
        const val = inp?.value.trim() ?? "";
        if (inp && !val) { fail(statusEl, isOAuth ? "Enter an OAuth token." : "Enter an API key."); inp.focus(); return; }
        runAction(statusEl, "Verifying…", async () => {
          const credential = isEnvironment ? { authMode: "environment" as const } : isOAuth ? { oauthToken: val } : { apiKey: val };
          const res = await deps.connection().connect({ backend: "claude", canCommit, ...credential });
          if (!st.closed) {
            if (res.ok) done(isEnvironment ? "Claude connected using environment credentials." : isOAuth ? "Claude OAuth token connected." : "Claude API connected.");
            else fail(statusEl, res.detail);
          }
        });
      };
      makeBtn(footer, "mod-cta cc-wizard-connect", "Verify & connect", submit);
      inp?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submit(); } });
      return;
    }

    if (st.selected === "local") {
      body.createEl("h3", { text: "Ollama (local)" });
      makeInp(body, "Ollama host", "cc-wizard-host-input", "text", "http://localhost:11434", st.ollamaHost, (v) => { st.ollamaHost = v; });
      const modelInp = makeInp(body, "Ollama model", "cc-wizard-model-input", "text", "llama3.1", st.ollamaModel, (v) => { st.ollamaModel = v; });
      const statusEl = div(body, "cc-wizard-status", { role: "status" });
      makeBtn(footer, "cc-wizard-detect", "Detect models", () => {
        runAction(statusEl, "Detecting Ollama models…", async () => {
          const host = st.ollamaHost.trim() || "http://localhost:11434";
          const model = st.ollamaModel.trim() || "llama3.1";
          const models = deps.detectOllamaModels
            ? await deps.detectOllamaModels(host, model)
            : await new OllamaProvider(host, model).listModels();
          if (st.closed) return;
          if (!models.length) {
            fail(statusEl, "No models detected. Start Ollama (`ollama serve`) and pull a model.");
            return;
          }
          if (!models.includes(st.ollamaModel.trim())) {
            st.ollamaModel = models[0]!;
            modelInp.value = st.ollamaModel;
          }
          statusEl.addClass("is-ok");
          statusEl.setText(`Detected ${models.length} model(s): ${models.join(", ")}`);
        });
      });
      makeBtn(footer, "mod-cta cc-wizard-connect", "Test & connect", () => {
        runAction(statusEl, "Testing Ollama connection…", () =>
          testAndCommit(
            statusEl,
            {
              ollamaHost: st.ollamaHost.trim() || "http://localhost:11434",
              ollamaModel: st.ollamaModel.trim() || "llama3.1",
            },
            "local",
            `Ollama connected (${st.ollamaModel.trim() || "llama3.1"}).`,
          ),
        );
      });
      return;
    }

    if (st.selected === "custom") {
      body.createEl("h3", { text: "OpenAI-compatible endpoint" });
      const hostInp = makeInp(body, "Endpoint host", "cc-wizard-host-input", "text", "http://localhost:1234", st.epHost, (v) => { st.epHost = v; });
      makeInp(body, "Endpoint model", "cc-wizard-model-input", "text", "Model ID", st.epModel, (v) => { st.epModel = v; });
      makeInp(body, "Endpoint API key", "cc-wizard-key-input", "password", "Optional bearer key", st.epKey, (v) => { st.epKey = v; });
      const statusEl = div(body, "cc-wizard-status", { role: "status" });
      makeBtn(footer, "mod-cta cc-wizard-connect", "Test & connect", () => {
        if (!st.epHost.trim()) { fail(statusEl, "Enter an endpoint host URL."); hostInp.focus(); return; }
        runAction(statusEl, "Testing endpoint…", () =>
          testAndCommit(
            statusEl,
            {
              openaiCompatHost: st.epHost.trim(),
              openaiCompatModel: st.epModel.trim(),
              openaiCompatKey: st.epKey.trim(),
            },
            "custom",
            `Endpoint connected (${sanitizeEndpointForDisplay(st.epHost.trim())}).`,
          ),
        );
      });
      return;
    }

    body.createEl("h3", { text: "On-device GPU" });
    makeSel(body, "On-device model", "cc-wizard-model-select", DEVICE_MODELS.map((m) => ({ id: m.id, label: m.label })), st.deviceModel, (v) => { st.deviceModel = v; });
    const statusEl = div(body, "cc-wizard-status", { role: "status" });
    makeBtn(footer, "mod-cta cc-wizard-connect", "Check GPU & connect", () => {
      runAction(statusEl, "Checking WebGPU support…", () =>
        testAndCommit(
          statusEl,
          { deviceChatModel: st.deviceModel },
          "device",
          "On-device GPU selected.",
        ),
      );
    });
  }
}
