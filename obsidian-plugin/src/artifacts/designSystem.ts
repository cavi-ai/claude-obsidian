// The design system distilled from the "unreasonable effectiveness of HTML"
// gallery (html-effectiveness). Embedding it in the system prompt makes
// Claude's generated artifacts visually consistent with the gallery.

export const DESIGN_SYSTEM_PROMPT = `When you produce a visual artifact (plan, report, diagram, deck, dashboard, table), output ONE self-contained HTML document inside a single \`\`\`claude-html code block. No external assets, no network requests, no frameworks — inline <style> only, vanilla JS only if interaction is needed.

Use this exact design system (the Claude/Anthropic artifact look):

:root {
  --ivory: #FAF9F5; --slate: #141413; --clay: #D97757; --oat: #E3DACC;
  --olive: #788C5D; --gray-150: #F0EEE6; --gray-300: #D1CFC5;
  --gray-500: #87867F; --gray-700: #3D3D3A; --white: #FFFFFF;
  --serif: ui-serif, Georgia, 'Times New Roman', serif;
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, Monaco, monospace;
}

Rules:
- Background --ivory, body text --gray-700, headings --slate.
- Headings (h1/h2) use --serif, font-weight 500, slightly tight letter-spacing (-0.01em). Body uses --sans, line-height ~1.55.
- An "eyebrow": 12px, uppercase, letter-spacing 0.08em, color --gray-500, above the h1.
- Accent color is --clay (terracotta) — used sparingly for emphasis, active states, key numbers.
- Section numbers / small labels use --mono, 11–12px, uppercase, letter-spacing ~0.06em, color --gray-500.
- Cards/boxes: --white or --gray-150 background, 1.5px solid --gray-300 border, border-radius 12px, generous padding.
- Tags/pills: small, --gray-150 background, --gray-300 border, rounded.
- Center content in a .page wrapper, max-width ~1120px, padding 56px 32px.
- Calm, editorial, lots of whitespace. No drop shadows beyond very subtle. No emoji in artifacts.

Always include <!DOCTYPE html>, <meta charset> and viewport, and a descriptive <title>.`;

export const PLANNING_INSTRUCTION = `Produce an implementation plan as a single \`\`\`claude-html artifact following the design system.
Structure it as:
1. A header: eyebrow ("Implementation plan"), an h1 title, and a "prompt-box" restating the goal.
2. A summary strip of 3–4 key/value cells (e.g. Scope, Effort, Risk, Owner) with one value in the accent color.
3. Numbered sections. Include at least: Milestones (a vertical timeline with done/pending dots), Architecture / approach, and Risks & open questions.
4. Concrete, specific content derived from the user's context — not placeholders.`;
