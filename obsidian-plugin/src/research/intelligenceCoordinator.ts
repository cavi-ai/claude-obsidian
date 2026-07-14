import { shouldFallbackToLocal, type ChatBackend } from "../providers/fallback";
import type { Provider, ProviderId } from "../providers/types";
import type { ProjectSnapshot } from "./graph";
import type { IntelligenceFinding } from "./intelligence";
import {
  buildNarrativeCacheKey,
  buildNarrativeRequest,
  parseNarrativeResponse,
  type NarrativeResult,
} from "./intelligenceNarrative";

export type IntelligenceNarratorMode = "current" | "claude" | "local" | "disabled";

type ValidNarrativeState = {
  status: "current" | "stale";
  cacheKey: string;
  providerId: ProviderId;
  model: string;
  usedFallback: boolean;
  result: NarrativeResult;
};

export type IntelligenceNarrativeState =
  | { status: "not-analyzed" }
  | { status: "analyzing"; cacheKey: string; providerId: ProviderId; model: string }
  | ValidNarrativeState
  | { status: "disabled" }
  | { status: "failed"; message: string; previous?: ValidNarrativeState };

export interface IntelligenceCoordinatorDeps {
  mode: () => IntelligenceNarratorMode;
  chatBackend: () => ChatBackend;
  anthropic: () => { provider: Provider; model: string };
  local: () => { provider: Provider; model: string };
  localAvailable: () => Promise<boolean>;
  maxTokens: () => number;
}

interface Selection {
  mode: Exclude<IntelligenceNarratorMode, "disabled">;
  chatBackend: ChatBackend;
  provider: Provider;
  model: string;
  contextKey: string;
  cacheKey: string;
}

interface CachedNarrative {
  projectPath: string;
  contextKey: string;
  cacheKey: string;
  providerId: ProviderId;
  model: string;
  usedFallback: boolean;
  result: NarrativeResult;
  sequence: number;
}

class ProviderSetupError extends Error {
  constructor(readonly providerId: ProviderId) {
    super(providerId === "anthropic"
      ? "Add your Anthropic credential in Claude Companion settings first."
      : "Start Ollama (`ollama serve`) or set the host in settings.");
  }
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof ProviderSetupError && error.providerId === "anthropic") return 401;
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

function errorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

function safeMessage(error: unknown): string {
  if (error instanceof ProviderSetupError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "Analysis canceled.";
  const status = errorStatus(error);
  if (status === 401 || status === 403) return "The selected provider rejected its credentials.";
  if (status === 429) return "The selected provider is rate-limited or out of usage.";
  if (status !== undefined && status >= 500) return "The selected provider is temporarily unavailable.";
  if (error instanceof Error && /narrative response/i.test(error.message)) return error.message;
  return "The intelligence analysis could not be completed.";
}

export class IntelligenceCoordinator {
  private readonly cache = new Map<string, CachedNarrative>();
  private desiredContextKeys = new Set<string>();
  private active: { controller: AbortController; sequence: number; contextKey: string; cacheKey: string; providerId: ProviderId; model: string } | undefined;
  private sequence = 0;

  constructor(private readonly deps: IntelligenceCoordinatorDeps) {}

  stateFor(snapshot: ProjectSnapshot, findings: IntelligenceFinding[]): IntelligenceNarrativeState {
    const mode = this.deps.mode();
    if (mode === "disabled") {
      this.desiredContextKeys.clear();
      return { status: "disabled" };
    }
    const request = buildNarrativeRequest(snapshot, findings);
    const selection = this.selection(snapshot.project.path, request.snapshotFingerprint, mode);
    this.desiredContextKeys = this.currentContextKeys(snapshot.project.path, request.snapshotFingerprint, selection);
    if (this.active && this.desiredContextKeys.has(this.active.contextKey)) {
      return { status: "analyzing", cacheKey: this.active.cacheKey, providerId: this.active.providerId, model: this.active.model };
    }
    const exact = [...this.cache.values()]
      .filter((entry) => this.desiredContextKeys.has(entry.contextKey))
      .sort((left, right) => right.sequence - left.sequence)[0];
    if (exact) return this.validState(exact, "current");
    const previous = this.latestForProject(snapshot.project.path);
    return previous ? this.validState(previous, "stale") : { status: "not-analyzed" };
  }

  async analyze(snapshot: ProjectSnapshot, findings: IntelligenceFinding[]): Promise<IntelligenceNarrativeState> {
    const mode = this.deps.mode();
    if (mode === "disabled") {
      this.cancel();
      this.desiredContextKeys.clear();
      return { status: "disabled" };
    }

    const request = buildNarrativeRequest(snapshot, findings);
    const selection = this.selection(snapshot.project.path, request.snapshotFingerprint, mode);
    this.desiredContextKeys = this.currentContextKeys(snapshot.project.path, request.snapshotFingerprint, selection);
    this.active?.controller.abort();
    const controller = new AbortController();
    const sequence = ++this.sequence;
    this.active = {
      controller,
      sequence,
      contextKey: selection.contextKey,
      cacheKey: selection.cacheKey,
      providerId: selection.provider.id,
      model: selection.model,
    };

    try {
      let chosen = { provider: selection.provider, model: selection.model };
      let usedFallback = false;
      let raw: string;
      try {
        raw = await this.complete(chosen, request.system, request.messages, controller.signal);
      } catch (error) {
        const message = errorMessage(error);
        const status = errorStatus(error);
        const eligible = mode === "current" && selection.chatBackend === "auto"
          && shouldFallbackToLocal({
            backend: "auto",
            localAvailable: await this.deps.localAvailable(),
            error: { ...(message !== undefined ? { message } : {}), ...(status !== undefined ? { status } : {}) },
          });
        if (!eligible || controller.signal.aborted) throw error;
        chosen = this.deps.local();
        usedFallback = true;
        const fallbackCacheKey = this.cacheKey(snapshot.project.path, request.snapshotFingerprint, mode, chosen);
        const fallbackContextKey = this.contextKey(fallbackCacheKey, selection.chatBackend);
        if (this.active?.sequence === sequence) {
          this.active = { ...this.active, contextKey: fallbackContextKey, cacheKey: fallbackCacheKey, providerId: chosen.provider.id, model: chosen.model };
        }
        raw = await this.complete(chosen, request.system, request.messages, controller.signal);
      }
      const result = parseNarrativeResponse(raw, new Set(request.allowedPaths));
      const cacheKey = buildNarrativeCacheKey({
        projectPath: snapshot.project.path,
        snapshotFingerprint: request.snapshotFingerprint,
        narratorMode: mode,
        providerId: chosen.provider.id,
        model: chosen.model,
      });
      const cached: CachedNarrative = {
        projectPath: snapshot.project.path,
        contextKey: this.contextKey(cacheKey, selection.chatBackend),
        cacheKey,
        providerId: chosen.provider.id,
        model: chosen.model,
        usedFallback,
        result,
        sequence,
      };
      this.cache.set(cacheKey, cached);
      return this.validState(cached, this.desiredContextKeys.has(cached.contextKey) ? "current" : "stale");
    } catch (error) {
      const previous = this.latestForProject(snapshot.project.path);
      return { status: "failed", message: safeMessage(error), ...(previous ? { previous: this.validState(previous, "stale") } : {}) };
    } finally {
      if (this.active?.sequence === sequence) this.active = undefined;
    }
  }

  cancel(): void {
    this.active?.controller.abort();
    this.active = undefined;
  }

  private selection(projectPath: string, snapshotFingerprint: string, mode: Exclude<IntelligenceNarratorMode, "disabled">): Selection {
    const chatBackend = this.deps.chatBackend();
    const chosen = mode === "claude" ? this.deps.anthropic()
      : mode === "local" ? this.deps.local()
      : chatBackend === "local" ? this.deps.local()
      : this.deps.anthropic();
    const cacheKey = this.cacheKey(projectPath, snapshotFingerprint, mode, chosen);
    return { mode, chatBackend, ...chosen, cacheKey, contextKey: this.contextKey(cacheKey, chatBackend) };
  }

  private complete(chosen: { provider: Provider; model: string }, system: string, messages: Parameters<Provider["complete"]>[0]["messages"], signal: AbortSignal): Promise<string> {
    if (!chosen.provider.hasCredentials()) throw new ProviderSetupError(chosen.provider.id);
    return chosen.provider.complete({ system, messages, model: chosen.model, maxTokens: this.deps.maxTokens(), temperature: 0, signal });
  }

  private currentContextKeys(projectPath: string, snapshotFingerprint: string, selection: Selection): Set<string> {
    const keys = new Set([selection.contextKey]);
    if (selection.mode === "current" && selection.chatBackend === "auto") {
      const local = this.deps.local();
      keys.add(this.contextKey(this.cacheKey(projectPath, snapshotFingerprint, selection.mode, local), selection.chatBackend));
    }
    return keys;
  }

  private cacheKey(projectPath: string, snapshotFingerprint: string, mode: Exclude<IntelligenceNarratorMode, "disabled">, chosen: { provider: Provider; model: string }): string {
    return buildNarrativeCacheKey({ projectPath, snapshotFingerprint, narratorMode: mode, providerId: chosen.provider.id, model: chosen.model });
  }

  private contextKey(cacheKey: string, chatBackend: ChatBackend): string {
    return `${cacheKey}:${chatBackend}`;
  }

  private latestForProject(projectPath: string): CachedNarrative | undefined {
    return [...this.cache.values()].filter((entry) => entry.projectPath === projectPath).sort((left, right) => right.sequence - left.sequence)[0];
  }

  private validState(entry: CachedNarrative, status: "current" | "stale"): ValidNarrativeState {
    return { status, cacheKey: entry.cacheKey, providerId: entry.providerId, model: entry.model, usedFallback: entry.usedFallback, result: entry.result };
  }
}
