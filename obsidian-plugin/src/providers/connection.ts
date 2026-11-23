import type { PluginSettings } from "../types";
import { secretIdFor, type SecretStore } from "../secrets/store";
import type { ProviderStatus } from "./types";

export interface ConnectionChoice {
  backend: PluginSettings["chatBackend"];
  authMode?: "environment";
  apiKey?: string;
  oauthToken?: string;
  canCommit?: () => boolean;
}

/** One transaction for the setup card and settings: verify before replacing a working connection. */
export class ConnectionController {
  private pending: Promise<ProviderStatus> | undefined;
  private disposed = false;
  private pendingChoice: ConnectionChoice | undefined;
  constructor(private readonly deps: {
    settings(): PluginSettings;
    test(candidate: PluginSettings): Promise<ProviderStatus>;
    save(): Promise<void>;
    store: SecretStore;
  }) {}

  dispose(): void { this.disposed = true; }

  connect(choice: ConnectionChoice): Promise<ProviderStatus> {
    if (this.pending) {
      if (
        this.pendingChoice?.backend === choice.backend &&
        this.pendingChoice.authMode === choice.authMode &&
        this.pendingChoice.apiKey === choice.apiKey &&
        this.pendingChoice.oauthToken === choice.oauthToken &&
        this.pendingChoice.canCommit === choice.canCommit
      ) return this.pending;
      return Promise.resolve({ ok: false, detail: "A different connection is being checked. Try again when it finishes." });
    }
    this.pendingChoice = { ...choice };
    const pending = this.perform(choice).catch((error: unknown): ProviderStatus => ({
      ok: false, detail: error instanceof Error ? error.message : String(error),
    }));
    this.pending = pending;
    void pending.then(() => { if (this.pending === pending) { this.pending = undefined; this.pendingChoice = undefined; } });
    return pending;
  }

  private async perform(choice: ConnectionChoice): Promise<ProviderStatus> {
    const settings = this.deps.settings();
    const previous = {
      chatBackend: settings.chatBackend,
      authMode: settings.authMode,
      apiKey: settings.apiKey,
      oauthToken: settings.oauthToken,
    };
    const checked = { ...previous, baseUrl: settings.baseUrl };
    const next = { ...settings, chatBackend: choice.backend };
    if (choice.authMode === "environment") next.authMode = choice.authMode;
    if (choice.apiKey !== undefined) {
      if (!choice.apiKey.trim()) return { ok: false, detail: "Enter an API key." };
      next.apiKey = choice.apiKey.trim();
      next.authMode = "apiKey";
    }
    if (choice.oauthToken !== undefined) {
      if (!choice.oauthToken.trim()) return { ok: false, detail: "Enter an OAuth token." };
      next.oauthToken = choice.oauthToken.trim();
      next.authMode = "oauthToken";
    }
    if (this.disposed || choice.canCommit?.() === false) throw new Error("Connection setup was closed. Try again.");
    const result = await this.deps.test(next);
    if (!result.ok) return result;
    if (this.disposed || choice.canCommit?.() === false) throw new Error("Connection setup was closed. Try again.");
    if (Object.entries(checked).some(([key, value]) => settings[key as keyof typeof checked] !== value)) {
      throw new Error("The connection changed while checking it. Try again.");
    }
    const store = this.deps.store;
    const keyId = secretIdFor("apiKey");
    const storedBefore = choice.apiKey === undefined ? null : store.get(keyId);
    const restoreKey = (): void => {
      store.set(keyId, storedBefore ?? "");
      if ((store.get(keyId) ?? "") !== (storedBefore ?? "")) throw new Error("Could not restore the previous stored key. Check Obsidian secret storage.");
    };
    if (choice.apiKey !== undefined && (!store.available() || !store.set(keyId, next.apiKey) || store.get(keyId) !== next.apiKey)) {
      if (store.available()) restoreKey();
      throw new Error("Could not securely store the API key. Check Obsidian's secret storage, then retry.");
    }

    const tokenId = secretIdFor("oauthToken");
    const storedTokenBefore = choice.oauthToken === undefined ? null : store.get(tokenId);
    const restoreToken = (): void => {
      store.set(tokenId, storedTokenBefore ?? "");
      if ((store.get(tokenId) ?? "") !== (storedTokenBefore ?? "")) throw new Error("Could not restore the previous stored token. Check Obsidian secret storage.");
    };
    if (choice.oauthToken !== undefined && (!store.available() || !store.set(tokenId, next.oauthToken) || store.get(tokenId) !== next.oauthToken)) {
      if (store.available()) {
        restoreToken();
        if (choice.apiKey !== undefined) restoreKey();
      }
      throw new Error("Could not securely store the OAuth token. Check Obsidian's secret storage, then retry.");
    }

    Object.assign(settings, {
      chatBackend: next.chatBackend,
      authMode: next.authMode,
      apiKey: next.apiKey,
      oauthToken: next.oauthToken,
    });
    try { await this.deps.save(); }
    catch (error) {
      Object.assign(settings, previous);
      if (choice.apiKey !== undefined) restoreKey();
      if (choice.oauthToken !== undefined) restoreToken();
      try { await this.deps.save(); }
      catch { throw new Error("Could not save or restore the connection settings. Check storage and retry."); }
      throw error;
    }
    return { ok: true, detail: "Connected. Ready to chat." };
  }
}
