import type { CliChild } from "./session";

export interface CliModel { id: string; label: string }

export function parseAgyModels(stdout: string): CliModel[] {
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  const clean = stdout.replace(ansi, "").trim();
  if (!clean) return [];
  const seen = new Map<string, CliModel>();
  const add = (idRaw: unknown, labelRaw?: unknown): void => {
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id || /^fetching available models/i.test(id)) return;
    const label = typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : id;
    if (!seen.has(id)) seen.set(id, { id, label });
  };
  try {
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    const cmd = parsed.command && typeof parsed.command === "object" ? (parsed.command as Record<string, unknown>) : parsed;
    const data = cmd.data && typeof cmd.data === "object" ? (cmd.data as Record<string, unknown>) : cmd;
    const list = Array.isArray(data.models) ? data.models : Array.isArray(parsed.models) ? parsed.models : Array.isArray(parsed) ? parsed : null;
    if (list) {
      for (const item of list) {
        if (typeof item === "string") add(item, item);
        else if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          add(rec.id ?? rec.model ?? rec.name, rec.label ?? rec.displayName ?? rec.display_name ?? rec.name);
        }
      }
      return [...seen.values()];
    }
  } catch {
    // Fall through to line/TSV parsing.
  }
  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^fetching available models/i.test(line) || /^(?:id|model)(?:\s+|\t)/i.test(line) || /^[-=\s]+$/.test(line)) continue;
    const tabParts = line.split("\t").map((s) => s.trim()).filter(Boolean);
    if (tabParts.length >= 2) {
      add(tabParts[0], tabParts[1]);
      continue;
    }
    const spaceMatch = /^([a-z0-9._/-]+)(?:\s{2,}(.+))?$/i.exec(line);
    if (spaceMatch) add(spaceMatch[1], spaceMatch[2] ?? spaceMatch[1]);
  }
  return [...seen.values()];
}

export function parseOpenCodeModels(stdout: string): CliModel[] {
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  const ids = stdout.replace(ansi, "").split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[^\s/]+\/[^\s]+$/.test(line));
  return [...new Set(ids)].map((id) => ({ id, label: id }));
}

/** Read-only app-server handshake and paginated catalog. Never creates a thread or turn. */
export function listCodexModels(spawn: () => CliChild): Promise<CliModel[]> {
  return new Promise((resolve, reject) => {
    const child = spawn();
    const models = new Map<string, CliModel>();
    const cursors = new Set<string>();
    let buffer = "";
    let requestId = 0;
    let settled = false;
    let exited = false;
    let killTimer: number | undefined;
    const timer = window.setTimeout(() => finish(new Error("Codex model discovery timed out.")), 10_000);
    const stop = (): void => {
      if (exited) return;
      killTimer = window.setTimeout(() => { if (!exited) child.kill("SIGKILL"); }, 2_000);
      child.kill("SIGTERM");
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      stop();
      if (error) reject(error);
      else resolve([...models.values()]);
    };
    const send = (message: unknown): void => {
      if (settled) return;
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`, (error) => { if (error) finish(error); });
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    };
    const list = (cursor?: string): void => {
      send({ id: ++requestId, method: "model/list", params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } });
    };
    child.on("exit", () => {
      exited = true;
      if (killTimer !== undefined) window.clearTimeout(killTimer);
      finish(new Error("Codex exited before returning its models."));
    });
    child.on("error", (error) => finish(error));
    child.stdin.on?.("error", (error) => finish(error));
    child.stderr.on("data", () => {}); // Drain startup diagnostics without exposing credentials.
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      buffer += String(chunk);
      if (buffer.length > 1_000_000) { finish(new Error("Codex model response is too large.")); return; }
      let newline: number;
      while (!settled && (newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line) as { id?: number; error?: { message?: string }; result?: { data?: Record<string, unknown>[]; nextCursor?: string | null } };
          if (message.id !== requestId) continue;
          if (message.error) { finish(new Error(message.error.message ?? "Codex model discovery failed.")); return; }
          if (requestId === 0) { send({ method: "initialized", params: {} }); list(); continue; }
          if (!Array.isArray(message.result?.data)) throw new Error("Codex returned an invalid model list.");
          for (const model of message.result.data) {
            if (!model || model.hidden === true) continue;
            const id = typeof model.model === "string" ? model.model.trim() : typeof model.id === "string" ? model.id.trim() : "";
            if (id && !models.has(id)) models.set(id, { id, label: typeof model.displayName === "string" ? model.displayName : id });
          }
          const cursor = message.result.nextCursor;
          if (!cursor) { finish(); return; }
          if (cursors.has(cursor)) throw new Error("Codex repeated a model-list cursor.");
          cursors.add(cursor);
          list(cursor);
        } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      }
    });
    send({ id: 0, method: "initialize", params: { clientInfo: { name: "claude_companion", title: "Claude Companion", version: "1" } } });
  });
}
