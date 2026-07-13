# Task 8 report — evidence lineage and release proof

## Outcome

Added an end-to-end fixture that exercises the public Phase 1 repository path:
captured Markdown plus Zotero metadata → SHA-256-fingerprinted source → exact
reviewed evidence → native `supports` claim relation → evidence-backed outline
→ clean audit. The fixture also reconstructs the graph from canonical Markdown
using a fresh repository instance.

Companion cases prove that a changed source fingerprint makes reviewed evidence
stale and leaves its claim unsupported, and that proposed evidence is visible
but does not count as trusted claim support.

The first fixture run exposed a canonical serialization mismatch for the
year-only string `published: "2026"`: it round-tripped through YAML as a number
and was rejected by the research parser. `buildFrontmatter` now quotes
numeric-looking strings while continuing to emit actual number values
unquoted. A focused serializer regression test covers year, leading-zero, and
scientific-notation strings.

Both READMEs now describe the Phase 1 workflow and boundary accurately: only
reviewed, locatable, non-stale evidence linked to a valid source is trusted,
and Phase 1 stops at an evidence-backed outline rather than a complete paper.

## Verification evidence

- `pnpm exec vitest run test/research/evidenceLineage.test.ts` initially ran 3
  tests with 1 expected contract failure: `published must be a non-empty string`.
- `pnpm exec vitest run test/frontmatter.test.ts test/research/evidenceLineage.test.ts`
  after the repair: 2 files passed, 21 tests passed.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0.
- `pnpm test`: 82 files passed, 775 tests passed.
- `pnpm run build`: exit 0; TypeScript validation and production esbuild bundle
  completed, regenerating tracked `obsidian-plugin/main.js`.
- `git diff --check`: exit 0.
- No changes to `manifest.json`, `versions.json`, or `package.json`.

## Manual proof status

No configured development/test vault path or safe test-vault runtime was
discoverable in this checkout. Per the task safety boundary, no user vault was
modified and no runtime service or installation was attempted. The automated
substitute uses an in-memory canonical Markdown vault and proves persisted-file
reconstruction, readable outline content, exact provenance, clean audit,
staleness invalidation, and reviewed-only trust. Screenshots of Overview,
Claim, and Audit states therefore remain blocked on an explicitly provided safe
test vault/runtime.

## Scope and concerns

- The pre-existing modified `upstream/html-effectiveness` submodule was
  preserved and is not part of this task.
- No release, tag, push, PR, dependency install, runtime service, or version
  change was performed.

## Automated review follow-up

All automated Task 8 findings were addressed in a follow-up hardening pass:

- Captured Markdown/text now lives canonically between explicit markers in the
  research-source note body. Every repository load derives the source's current
  SHA-256 fingerprint from that persisted payload and discards the editable
  frontmatter fingerprint as an authority. A fresh repository reconstruction
  therefore observes source edits automatically, even if frontmatter is
  spoofed back to the old fingerprint.
- The Obsidian repository adapter now reads binary asset bytes. Binary captures
  require an asset path, and the adapter's asset bytes—not caller-supplied bytes
  or fingerprint metadata—drive reconstruction. If previously captured bytes
  become unavailable, evidence holding the old fingerprint is stale rather than
  trusted. Metadata-only sources remain unfingerprinted.
- Evidence-backed outlines now emit exact excerpts only for reviewed,
  locator-valid, non-stale evidence. Proposed, stale, missing-source, or
  missing-locator evidence appears only in a separated `Excluded evidence`
  summary without its excerpt.
- `buildFrontmatter` now quotes every string, including list items. Regression
  coverage includes hex, octal, infinity, NaN, boolean/null-like, numeric,
  leading-zero, scientific-notation, and date-like strings, plus parsed tags
  and wikilinks.

The manual test-vault and screenshot blocker described above is unchanged. No
safe configured vault/runtime was discovered, so no user vault or runtime
service was touched.

Fresh follow-up verification:

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0.
- `pnpm test`: 82 files passed, 777 tests passed.
- `pnpm run build`: exit 0; production bundle regenerated.
- `git diff --check`: exit 0.
- No manifest, package, or versions file changed.

## Final P1 encoding hardening

Captured text is now stored as a collision-safe, reversible UTF-8 percent-
encoded payload under an explicit `encoding=percent-utf8 version=1` marker.
The encoded payload occupies one structural line, so source text containing
either legacy marker literal, Unicode, percent characters, LF, or CRLF cannot
terminate or reshape the envelope. Reconstruction decodes the complete payload
before hashing and preserves the original string exactly.

Malformed encoded payloads, incomplete envelopes, unknown encoding versions,
and legacy unencoded marker notes yield an `invalid-value` parse issue and no
captured payload. Repository reconstruction therefore discards their editable
frontmatter fingerprint and cannot silently trust or hash an ambiguous prefix;
legacy captures must be re-imported. Focused coverage proves collision-prone
Unicode and mixed-line-ending round trips plus identical fresh-reconstruction
fingerprints. The manual test-vault blocker remains unchanged.

Final P1 verification: typecheck and lint exited 0; all 82 test files and 779
tests passed; the production build exited 0 and regenerated `main.js`; diff
checks passed; no package, manifest, or versions file changed.
