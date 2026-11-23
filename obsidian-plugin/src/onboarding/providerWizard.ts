// Pure catalog, status derivation, and helpers for the 3-step Provider Setup Wizard.

import { agyBackend } from "../cli/backends/agy";
import { claudeBackend } from "../cli/backends/claude";
import { codexBackend } from "../cli/backends/codex";
import { opencodeBackend } from "../cli/backends/opencode";
import type { CliBackend } from "../cli/backends/types";
import type { CliProvider } from "../providers/cliProvider";
import type { CliBackendId, ProviderRouter } from "../providers/router";
import { sanitizeEndpointForDisplay } from "../providers/endpointPolicy";
import type { PluginSettings } from "../types";

export type WizardProviderId = CliBackendId | "claude" | "local" | "custom" | "device";
export type WizardBadgeState = "ready" | "warning" | "missing" | "neutral";

export interface WizardProviderCard {
  id: WizardProviderId;
  label: string;
  subtitle: string;
  badgeText: string;
  badgeState: WizardBadgeState;
  detail: string;
  cliBackend?: CliBackend;
}

export const CLI_WIZARD_BACKENDS: Record<CliBackendId, CliBackend> = {
  "agy-cli": agyBackend,
  "claude-cli": claudeBackend,
  "codex-cli": codexBackend,
  "opencode-cli": opencodeBackend,
};

export const CLI_INSTALL_HINTS: Record<CliBackendId, string> = {
  "agy-cli": "Install Antigravity CLI (`agy`), then run `agy` in your terminal to sign in.",
  "claude-cli": "Install Claude Code, then run `claude auth login`.",
  "codex-cli": "Install Codex CLI, then run `codex login`.",
  "opencode-cli": "Install OpenCode, then run `opencode auth login`.",
};

export const CLI_IDS: readonly CliBackendId[] = ["agy-cli", "claude-cli", "codex-cli", "opencode-cli"];

export function cliSignInCommand(backend: CliBackend): string {
  return /`([^`]+)`/.exec(backend.signInHint)?.[1] ?? backend.binary;
}

export function isCliWizardProvider(id: WizardProviderId): id is CliBackendId {
  return id === "agy-cli" || id === "claude-cli" || id === "codex-cli" || id === "opencode-cli";
}

export function cliProviderOf(router: ProviderRouter, id: CliBackendId): CliProvider | undefined {
  return id === "agy-cli" ? router.agyCli : id === "claude-cli" ? router.claudeCli : id === "codex-cli" ? router.codexCli : router.opencodeCli;
}

export function defaultWizardProvider(settings: PluginSettings, router: ProviderRouter, isMobile: boolean): WizardProviderId {
  const cur = settings.chatBackend;
  if (!isMobile && isCliWizardProvider(cur as WizardProviderId)) return cur as CliBackendId;
  if (!isMobile) {
    for (const id of CLI_IDS) if (cliProviderOf(router, id)?.hasCredentials?.()) return id;
  }
  return cur === "local" || cur === "custom" || cur === "device" ? cur : "claude";
}

const CLI_SUBTITLES: Record<CliBackendId, string> = {
  "agy-cli": "Google Antigravity desktop CLI subscription",
  "claude-cli": "Anthropic Claude Code desktop CLI subscription",
  "codex-cli": "OpenAI Codex desktop CLI subscription",
  "opencode-cli": "OpenCode desktop CLI providers",
};

export function buildWizardProviderCards(settings: PluginSettings, router: ProviderRouter, isMobile: boolean): WizardProviderCard[] {
  const cards: WizardProviderCard[] = [];
  if (!isMobile) {
    for (const id of CLI_IDS) {
      const b = CLI_WIZARD_BACKENDS[id];
      const p = cliProviderOf(router, id);
      const ok = p?.hasCredentials?.() === true;
      const probe = p?.probe?.() ?? null;
      cards.push({
        id,
        label: b.label,
        subtitle: CLI_SUBTITLES[id],
        badgeText: ok ? "Signed in" : probe ? "Sign-in required" : "Not detected",
        badgeState: ok ? "ready" : probe ? "warning" : "missing",
        detail: ok
          ? (probe?.version ? `${b.label} ${probe.version} ready` : `${b.label} is signed in and ready.`)
          : probe
            ? `Installed (${probe.executable}) · ${b.signInHint}`
            : `Install ${b.binary}, then ${b.signInHint}`,
        cliBackend: b,
      });
    }
  }
  const apiOk = router.anthropic?.hasCredentials?.() === true;
  const host = settings.ollamaHost.trim() || "http://localhost:11434";
  const epOk = Boolean(settings.openaiCompatHost.trim() && settings.openaiCompatModel.trim());
  cards.push(
    {
      id: "claude",
      label: "Claude API",
      subtitle: "Direct Anthropic API key or subscription OAuth token",
      badgeText: apiOk ? "Configured" : "API key / OAuth",
      badgeState: apiOk ? "ready" : "neutral",
      detail: apiOk ? "Anthropic credential configured." : "Bring your own key from console.anthropic.com.",
    },
    {
      id: "local",
      label: "Ollama (local)",
      subtitle: "Private local models on this machine or LAN",
      badgeText: settings.chatBackend === "local" ? "Active" : "Local server",
      badgeState: settings.chatBackend === "local" ? "ready" : "neutral",
      detail: `${sanitizeEndpointForDisplay(host)} · ${settings.ollamaModel || "llama3.1"}`,
    },
    {
      id: "custom",
      label: "OpenAI-compatible endpoint",
      subtitle: "LM Studio, mlx-lm, vLLM, Jan, or custom gateway",
      badgeText: epOk ? "Configured" : "Endpoint URL",
      badgeState: epOk ? "ready" : "neutral",
      detail: epOk ? `${sanitizeEndpointForDisplay(settings.openaiCompatHost)} · ${settings.openaiCompatModel}` : "Connect any /v1/chat/completions server.",
    },
    {
      id: "device",
      label: "On-device GPU",
      subtitle: "Runs inside Obsidian with WebGPU · no external server",
      badgeText: settings.chatBackend === "device" ? "Active" : "Inside Obsidian",
      badgeState: settings.chatBackend === "device" ? "ready" : "neutral",
      detail: `Model: ${settings.deviceChatModel}`,
    },
  );
  return cards;
}
