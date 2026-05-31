# Design-system extensions

Additive layers on top of the base "note-to-artifact" design system (which is
inspired by Thariq Shihipar's original HTML set — see the repository `NOTICE`).

**Rule:** never edit the base set. Add a new file here per variation; each file
documents the tokens/components it overrides or adds. The `note-to-artifact`
skill prefers an applicable extension's tokens over the defaults.

## File format

Each extension is a Markdown file describing the variation, for example:

```md
# <name> extension

When to use: <one line>

## Token overrides
- Accent: #...
- Heading font: ...

## Added components
- <component>: <description + minimal inline-HTML/SVG snippet>
```

No base file is removed or rewritten — extensions only add.
