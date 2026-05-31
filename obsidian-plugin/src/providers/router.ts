import type { PluginSettings } from "../types";
import type { Provider, ProviderId, TaskRole } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";
import { resolveModelId } from "../claude/models";

/**
 * Builds providers from settings and routes a task to the right one:
 * - "chat"    → the user's primary provider (Claude by default)
 * - "utility" → the local model if enabled (summaries, tagging, ingestion),
 *               otherwise falls back to the chat provider.
 */
export class ProviderRouter {
  readonly anthropic: AnthropicProvider;
  readonly ollama: OllamaProvider;

  constructor(private settings: PluginSettings) {
    this.anthropic = new AnthropicProvider(settings.apiKey);
    this.ollama = new OllamaProvider(settings.ollamaHost, settings.ollamaModel);
  }

  get(id: ProviderId): Provider {
    return id === "ollama" ? this.ollama : this.anthropic;
  }

  /** Resolve which provider + model id to use for a given task role. */
  resolve(role: TaskRole): { provider: Provider; model: string } {
    if (role === "utility" && this.settings.localUtilityEnabled && this.ollama.hasCredentials()) {
      return { provider: this.ollama, model: this.settings.ollamaModel };
    }
    return {
      provider: this.anthropic,
      model: resolveModelId(this.settings.model, this.settings.customModel),
    };
  }

  /** The provider that powers the main chat panel. */
  chatProvider(): { provider: Provider; model: string } {
    return this.resolve("chat");
  }
}
