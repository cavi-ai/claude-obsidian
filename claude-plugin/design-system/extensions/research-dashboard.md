# research-dashboard extension

When to use: turning research notes, a literature review, or an experiment log
into a **dashboard** artifact — a single screen of metrics, findings, and
sources rather than a linear report. Good for "what does my vault know about X"
roundups.

This is an *additive* layer over the base `note-to-artifact` design system. It
only overrides the tokens/components listed here; everything else (palette
defaults, self-contained-HTML rule, claude-html fencing) comes from the base.

## Token overrides

- Accent: keep `--clay (#D97757)` for the single headline metric, but use
  `--olive (#788C5D)` for "supporting / corroborating" signals and
  `--blue (#6A9BCC)` for "open question / needs more data" signals, so the
  reader can scan confidence at a glance.
- Heading font: base `--serif` (unchanged).
- Density: tighten the base `.page` padding to `40px 32px` and raise content
  max-width to `1180px` — dashboards earn the extra horizontal room.

## Added components

### Metric strip (`.metrics`)
A row of 3–5 stat cards. The first card is the headline finding in `--clay`;
the rest are supporting in `--gray-700`.

```html
<div class="metrics" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin:24px 0">
  <div style="border:1.5px solid #D1CFC5;border-radius:12px;padding:18px;background:#fff">
    <div style="font:600 12px/1 'SF Mono',Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;letter-spacing:.06em;text-transform:uppercase;color:#87867F">Headline</div>
    <div style="font:500 30px/1.1 ui-serif,Georgia,serif;color:#D97757;margin-top:8px">+34%</div>
    <div style="font:400 13px/1.4 system-ui,sans-serif;color:#87867F;margin-top:6px">vs. prior period</div>
  </div>
  <!-- supporting cards: same markup, value color #3D3D3A -->
</div>
```

### Finding row (`.finding`)
A claim with a confidence pill and an inline source reference.

```html
<div class="finding" style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #D1CFC5">
  <span style="flex:0 0 auto;font:600 11px/1.6 'SF Mono',Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:999px;background:#F0EEE6;border:1px solid #D1CFC5;color:#788C5D">corroborated</span>
  <div style="font:400 14.5px/1.5 system-ui,sans-serif;color:#3D3D3A">
    Claim text here. <span style="color:#87867F">— Source.md</span>
  </div>
</div>
```
Use the olive pill for "corroborated", clay for "headline", blue for "open".

### Confidence bar (inline SVG)
A small horizontal bar (reuse the base chart palette) showing how many sources
support each finding — inline SVG only, no libraries.

## Layout

1. Eyebrow ("Research dashboard") + h1 topic + one-line synthesis.
2. `.metrics` strip.
3. `## Key findings` as a list of `.finding` rows, ordered by confidence.
4. `## Sources` — the vault notes the dashboard drew from, as a compact list.

Never edit the base set to achieve this — all of the above layers on top.
