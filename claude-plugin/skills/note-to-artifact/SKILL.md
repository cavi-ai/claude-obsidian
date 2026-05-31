---
name: note-to-artifact
description: Use when turning notes, data, or a plan into a beautiful, self-contained HTML artifact (report, dashboard, plan, table, or diagram) in the Anthropic-flavored "HTML is all you need" style — especially for Obsidian notes rendered in a ```claude-html``` block.
---

# Note → artifact

Turn source material into **one self-contained HTML document** that is
beautiful, information-dense, and renders with no external resources.

This style is inspired by Thariq Shihipar's "HTML is all you need to make
effective reports/dashboards" (see the repo NOTICE/README for attribution).

## Design system

**Colors**
- Background `#FAF9F5` (warm ivory); surfaces `#FFFFFF` cards on `#F0EEE6`
  panels; borders `#D1CFC5`
- Text `#141413` (near-black), `#3D3D3A` (muted), `#87867F` (subtle)
- Accent `#D97757` (clay/terracotta); secondary `#788C5D` (olive), `#6A9BCC` (blue)

**Typography**
- Serif for headings (`ui-serif, Georgia`), sans (`system-ui`) for body, mono
  (`ui-monospace`) for code/labels
- Line-height ~1.6; large headings; letter-spacing on small eyebrow labels

**Layout**
- Max-width ~960px, centered, 32–48px padding
- Card-based; rounded corners (8–16px); subtle shadows
- CSS grid for stat rows and multi-column sections

**Charts**
- Inline SVG only — no external libraries. Use the clay/olive/blue palette.

## Format selection

Pick the format that fits the content: **plan**, **report**, **table**,
**diagram/flow**, or **dashboard**. Lead with the single most important number
or takeaway.

## Hard requirements

- Output a SINGLE self-contained HTML document — no external CSS/JS/font/image
  requests. Inline everything.
- Escape any user/content text interpolated into HTML.
- When saving into Obsidian, wrap the document in a ```` ```claude-html ````
  fenced block so the Claude Companion plugin renders it inline.

## Extending the style

Project-specific variations live in `design-system/extensions/` (additive
overrides layered on top of this base — never edit the base set). If an
extension applies to the current vault, prefer its tokens over the defaults.
