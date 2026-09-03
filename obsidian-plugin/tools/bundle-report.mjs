// Prints the largest inputs of main.js from .build/meta.json (pnpm run build first).
import { readFile } from "node:fs/promises";

const meta = JSON.parse(await readFile(new URL("../.build/meta.json", import.meta.url), "utf8"));
const output = Object.entries(meta.outputs).find(([name]) => name.endsWith("main.js"));
if (!output) throw new Error("main.js is not in the metafile");
const [, info] = output;
const rows = Object.entries(info.inputs).map(([file, { bytesInOutput }]) => [file, bytesInOutput]).sort((a, b) => b[1] - a[1]).slice(0, 15);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`main.js: ${kb(info.bytes)}`);
for (const [file, bytes] of rows) console.log(`${kb(bytes).padStart(10)}  ${file}`);
