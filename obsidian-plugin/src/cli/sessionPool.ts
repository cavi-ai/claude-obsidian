// The CLI sessions open for chat conversations: one per conversation, reused while its signature holds
// and the process is alive, at most `capacity` open with the least recently used idle one closed first.
// Closing a session then runs its entry's release. Pure; opening is injected.

export interface PooledSession {
  isBusy(): boolean;
  isClosed(): boolean;
  interrupt(): void;
  close(): Promise<void>;
}

/** What `open` returns: the session plus the cleanup for everything opened with it. */
export interface PoolEntry<S extends PooledSession> {
  session: S;
  release(): Promise<void>;
}

export class CliSessionPool<S extends PooledSession> {
  private readonly entries = new Map<string, { entry: PoolEntry<S>; session: S; signature: string; lastUsed: number }>();

  constructor(
    private readonly capacity: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * The conversation's open session when its signature matches and it is alive; otherwise the old one is
   * closed, idle sessions over capacity are evicted, and `open` supplies a new one. `fresh` always opens.
   * When `open` throws nothing is stored; `open` releases what it opened.
   */
  async acquire(id: string, signature: string, open: () => Promise<PoolEntry<S>>, opts: { fresh?: boolean } = {}): Promise<S> {
    const existing = this.entries.get(id);
    if (!opts.fresh && existing && existing.signature === signature && !existing.session.isClosed()) {
      existing.lastUsed = this.now();
      return existing.session;
    }
    if (existing) await this.close(id);
    while (this.entries.size >= this.capacity) {
      const idle = [...this.entries].filter(([, entry]) => !entry.session.isBusy()).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (!idle) break;
      await this.close(idle[0]);
    }
    const entry = await open();
    this.entries.set(id, { entry, session: entry.session, signature, lastUsed: this.now() });
    return entry.session;
  }

  interrupt(id: string): void {
    this.entries.get(id)?.session.interrupt();
  }

  async close(id: string): Promise<void> {
    const held = this.entries.get(id);
    if (!held) return;
    this.entries.delete(id);
    await held.session.close();
    await held.entry.release();
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.entries.keys()]) await this.close(id);
  }
}
