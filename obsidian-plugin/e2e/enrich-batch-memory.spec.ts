import { test, expect } from "@playwright/test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchObsidianHarness, type ObsidianHarness } from "./obsidianHarness";

const ENABLED = process.env.CC_E2E_MEMORY === "1";
const CLIPS = 40;
const FILLER = Number(process.env.CC_E2E_MEMORY_NOTES ?? "2000");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".tmp", "phase3");

const clipBody = (i: number, kb: number): string =>
  `---\ntitle: "Clip ${i}"\nsource: "https://example.test/clip-${i}"\nclipped: "2026-09-08"\n---\n` +
  `# Clip ${i}\n\n` + "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(Math.ceil((kb * 1024) / 57));

const fillerBody = (i: number): string => `# Filler ${i}\n\n` + `Note ${i} talks about cats, code, and the ocean. `.repeat(20);

function reply(i: number): string {
  return JSON.stringify({ title: `Clip ${i} typed`, site: "example.test", summary: `Summary of clip ${i}.` });
}

async function launch(): Promise<ObsidianHarness> {
  const extraFiles: Record<string, string> = {};
  for (let i = 0; i < CLIPS; i++) extraFiles[`Clippings/clip-${i}.md`] = clipBody(i, 5 + ((i * 37) % 196));
  for (let i = 0; i < FILLER; i++) extraFiles[`Notes/filler-${i}.md`] = fillerBody(i);
  let n = 0;
  return launchObsidianHarness({
    embedStub: true,
    extraFiles,
    settingsOverride: { sourceCaptureEnabled: true, sourceEnrichOnCreate: false, sourceCaptureConsent: "allow", enrichmentDiagnostics: true, semanticEnabled: true },
    providerReply: (body) => (/summary/i.test(body) ? reply(n++) : null),
  });
}

/** Kick off a full semantic rebuild and wait until no "semantic" activity record is still running,
 *  so the index holds the filler notes before either enrichment run and every save serializes a
 *  realistic size instead of an empty index. */
async function primeSemanticIndex(harness: ObsidianHarness): Promise<void> {
  await harness.page.evaluate(async () => {
    await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:rebuild-semantic-index");
  });
  await expect.poll(async () => harness.page.evaluate(() => {
    const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, { activity: { snapshot(): { records: Array<{ id: string; state: string }> } } }> } } }).app.plugins.plugins["claude-companion"];
    return plugin.activity.snapshot().records.some((r) => r.id.includes("semantic") && r.state === "running");
  }), { timeout: 15 * 60_000, intervals: [1000] }).toBe(false);
}

async function semanticIndexBytes(harness: ObsidianHarness): Promise<number> {
  const path = join(harness.paths.vault, ".obsidian", "plugins", "claude-companion", "semantic-index.json");
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function sampleHeap(harness: ObsidianHarness, until: () => Promise<boolean>, file: string): Promise<{ peak: number; samples: number }> {
  const cdp = await harness.page.context().newCDPSession(harness.page);
  await cdp.send("Performance.enable");
  const rows: string[] = ["t_ms,js_heap_used,js_heap_total"];
  const t0 = Date.now();
  let peak = 0;
  while (!(await until())) {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const used = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
    const total = metrics.find((m) => m.name === "JSHeapTotalSize")?.value ?? 0;
    peak = Math.max(peak, used);
    rows.push(`${Date.now() - t0},${used},${total}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, file), rows.join("\n") + "\n");
  return { peak, samples: rows.length - 1 };
}

async function batchDone(harness: ObsidianHarness): Promise<boolean> {
  return harness.page.evaluate(() => {
    const plugin = (window as unknown as { app: { plugins: { plugins: Record<string, { activity: { snapshot(): { records: Array<{ id: string; state: string }> } } }> } } }).app.plugins.plugins["claude-companion"];
    const rec = plugin.activity.snapshot().records.find((r) => r.id === "source-enrichment:inbox-batch");
    return rec !== undefined && rec.state !== "running";
  });
}

async function enrichedCount(harness: ObsidianHarness): Promise<number> {
  let count = 0;
  for (let i = 0; i < CLIPS; i++) {
    const text = await readFile(join(harness.paths.vault, "Clippings", `clip-${i}.md`), "utf8");
    if (/^source_enriched:\s*true\s*$/m.test(text)) count++;
  }
  return count;
}

test.describe("batch enrichment memory", () => {
  test.skip(!ENABLED, "set CC_E2E_MEMORY=1");
  test.setTimeout(20 * 60_000);

  test("Enrich all over 40 clips", async () => {
    const harness = await launch();
    try {
      await primeSemanticIndex(harness);
      const indexBytes = await semanticIndexBytes(harness);
      await harness.page.evaluate(async () => {
        await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:open-source-inbox");
      });
      await harness.page.getByRole("button", { name: "Enrich all" }).click();
      const { peak, samples } = await sampleHeap(harness, () => batchDone(harness), "memory-batch.csv");
      expect(await enrichedCount(harness)).toBe(CLIPS);
      const log = await readFile(join(harness.paths.vault, "Claude", "enrichment-diagnostics.log"), "utf8");
      await writeFile(join(OUT, "memory-batch.log"), log);
      const flushes = (log.match(/reindex-flush-start/g) ?? []).length;
      const saves = [...log.matchAll(/save-start bytes=(\d+)/g)].map((m) => Number(m[1]));
      await writeFile(join(OUT, "memory-summary.md"), `| run | peak JS heap MB | samples | flushes | saves | max save bytes | semantic index bytes at start |\n|---|---|---|---|---|---|---|\n| batch | ${(peak / 1048576).toFixed(1)} | ${samples} | ${flushes} | ${saves.length} | ${Math.max(0, ...saves)} | ${indexBytes} |\n`, { flag: "w" });
    } finally {
      await harness.close();
    }
  });

  test("40 single enrichments 3 s apart", async () => {
    const harness = await launch();
    try {
      await primeSemanticIndex(harness);
      const indexBytes = await semanticIndexBytes(harness);
      await harness.page.evaluate(async () => {
        await (window as unknown as { app: { commands: { executeCommandById(id: string): Promise<void> } } }).app.commands.executeCommandById("claude-companion:open-source-inbox");
      });
      let done = 0;
      const driver = (async () => {
        for (let i = 0; i < CLIPS; i++) {
          const row = harness.page.locator(".cc-inbox-row", { hasText: `clip-${i}` });
          await row.getByRole("button", { name: `Enrich clip-${i}`, exact: true }).click();
          const file = join(harness.paths.vault, "Clippings", `clip-${i}.md`);
          await expect.poll(async () => /^source_enriched:\s*true\s*$/m.test(await readFile(file, "utf8")), { timeout: 60_000 }).toBe(true);
          await new Promise((r) => setTimeout(r, 3000));
          done++;
        }
      })();
      const { peak, samples } = await sampleHeap(harness, async () => done >= CLIPS, "memory-single.csv");
      await driver;
      expect(await enrichedCount(harness)).toBe(CLIPS);
      const log = await readFile(join(harness.paths.vault, "Claude", "enrichment-diagnostics.log"), "utf8");
      await writeFile(join(OUT, "memory-single.log"), log);
      const flushes = (log.match(/reindex-flush-start/g) ?? []).length;
      const saves = [...log.matchAll(/save-start bytes=(\d+)/g)].map((m) => Number(m[1]));
      await writeFile(join(OUT, "memory-summary.md"), `| single | ${(peak / 1048576).toFixed(1)} | ${samples} | ${flushes} | ${saves.length} | ${Math.max(0, ...saves)} | ${indexBytes} |\n`, { flag: "a" });
    } finally {
      await harness.close();
    }
  });
});
