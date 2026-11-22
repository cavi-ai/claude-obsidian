import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "fflate";

function gzipBase64(text) {
  return Buffer.from(gzipSync(new TextEncoder().encode(text), { level: 9, mtime: 0 })).toString("base64");
}

function inflateExpr(base64) {
  return `strFromU8(gunzipSync(Uint8Array.from(atob("${base64}"), c => c.charCodeAt(0))))`;
}

// Keep the generated registry and large static prompt/proxy/catalog/schema data readable in source;
// only the distributed bundle carries compressed data. The existing worker decoder already includes fflate.
export function compressedSkillRegistry() {
  return {
    name: "compressed-skill-registry",
    setup(build) {
      build.onLoad({ filter: /[/\\]skillRegistry\.generated\.ts$/ }, async ({ path: filename }) => {
        const source = await readFile(filename, "utf8");
        const match = /export const SKILLS: SkillEntry\[\] = ([\s\S]*);\s*$/.exec(source);
        if (!match) throw new Error("Cannot read generated skill registry; regenerate it before bundling.");
        const json = JSON.stringify(JSON.parse(match[1]));
        const data = gzipBase64(json);
        return {
          contents: `import { gunzipSync, strFromU8 } from "fflate";
export const SKILLS = JSON.parse(${inflateExpr(data)});`,
          loader: "js",
          resolveDir: path.dirname(filename),
        };
      });

      build.onLoad({ filter: /[/\\]artifacts[/\\]designSystem\.ts$/ }, async ({ path: filename }) => {
        const { DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION } = await import(filename);
        const data = gzipBase64(JSON.stringify([DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION]));
        return {
          contents: `import { gunzipSync, strFromU8 } from "fflate";
const [DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION] = JSON.parse(${inflateExpr(data)});
export { DESIGN_SYSTEM_PROMPT, PLANNING_INSTRUCTION };`,
          loader: "js",
          resolveDir: path.dirname(filename),
        };
      });

      build.onLoad({ filter: /[/\\]workflows[/\\]catalog\.ts$/ }, async ({ path: filename }) => {
        const { WORKFLOWS } = await import(filename);
        const data = gzipBase64(JSON.stringify(WORKFLOWS));
        return {
          contents: `import { gunzipSync, strFromU8 } from "fflate";
export const WORKFLOWS = JSON.parse(${inflateExpr(data)});`,
          loader: "js",
          resolveDir: path.dirname(filename),
        };
      });

      build.onLoad({ filter: /[/\\]settingsItems[/\\]pageDesc\.ts$/ }, async ({ path: filename }) => {
        const { PAGE_DESC } = await import(filename);
        const data = gzipBase64(JSON.stringify(PAGE_DESC));
        return {
          contents: `import { gunzipSync, strFromU8 } from "fflate";
export const PAGE_DESC = JSON.parse(${inflateExpr(data)});`,
          loader: "js",
          resolveDir: path.dirname(filename),
        };
      });

      build.onLoad({ filter: /[/\\]integrations[/\\]desktopExtension\.ts$/ }, async ({ path: filename }) => {
        const source = await readFile(filename, "utf8");
        const match = /export const PROXY_SOURCE = String\.raw`([\s\S]*?)`;/.exec(source);
        if (!match) return undefined;
        const resolvedProxy = match[1]
          .replaceAll("${CONNECTION_FOLDER}", "Companion for Claude")
          .replaceAll("${CONNECTION_FILE}", "bridge.json")
          .replaceAll("${TOOLS_FILE}", "tools.json")
          .replaceAll("${EXTENSION_VERSION}", "1.2.0");
        const data = gzipBase64(resolvedProxy);
        return {
          contents:
            `import { gunzipSync, strFromU8 } from "fflate";\n` +
            source.replace(match[0], `export const PROXY_SOURCE: string = ${inflateExpr(data)};`),
          loader: "ts",
          resolveDir: path.dirname(filename),
        };
      });

      build.onLoad({ filter: /[/\\]view[/\\]slashCommands\.ts$/ }, async ({ path: filename }) => {
        const source = await readFile(filename, "utf8");
        const { SLASH_COMMANDS } = await import(filename);
        const start = source.indexOf("export const SLASH_COMMANDS: SlashCommand[] = [");
        if (start < 0) return undefined;
        const data = gzipBase64(JSON.stringify(SLASH_COMMANDS));
        return {
          contents:
            `import { gunzipSync, strFromU8 } from "fflate";\n` +
            source.slice(0, start) +
            `export const SLASH_COMMANDS: SlashCommand[] = JSON.parse(${inflateExpr(data)});\n`,
          loader: "ts",
          resolveDir: path.dirname(filename),
        };
      });

      build.onLoad({ filter: /[/\\]ontology[/\\]seed\.ts$/ }, async ({ path: filename }) => {
        const source = await readFile(filename, "utf8");
        const { getSchema } = await import(path.resolve(path.dirname(filename), "../sources/registry.ts"));
        const start = source.indexOf("export const SEED_TYPES: TypeDef[] = [");
        const endMarker = "/** The schema note an earlier seed wrote for this file";
        const end = source.indexOf(endMarker);
        if (start < 0 || end < 0) return undefined;
        const block = source
          .slice(start, end)
          .replace("export const SEED_TYPES: TypeDef[] =", "const SEED_TYPES =")
          .replace("const SUPERSEDED_SEED_TYPES: TypeDef[] =", "const SUPERSEDED_SEED_TYPES =");
        const fromSourceSchema = (sourceType) => {
          const s = getSchema(sourceType);
          return {
            name: sourceType,
            version: s.version,
            extendsType: "source",
            properties: s.fields
              .filter((f) => f.key !== "title")
              .map((f) => ({ key: f.key, type: f.type, required: f.required, ...(f.description ? { description: f.description } : {}) })),
            relations: [],
          };
        };
        const [seedTypes, superseded] = new Function("fromSourceSchema", `${block}\nreturn [SEED_TYPES, SUPERSEDED_SEED_TYPES];`)(fromSourceSchema);
        const data = gzipBase64(JSON.stringify([seedTypes, superseded]));
        const replaced =
          `import { gunzipSync, strFromU8 } from "fflate";\nimport type { TypeDef } from "./types";\n` +
          `const [SEED_TYPES, SUPERSEDED_SEED_TYPES]: [TypeDef[], TypeDef[]] = JSON.parse(${inflateExpr(data)});\nexport { SEED_TYPES };\n\n` +
          source.slice(end);
        return {
          contents: replaced,
          loader: "ts",
          resolveDir: path.dirname(filename),
        };
      });
    },
  };
}
