#!/usr/bin/env bash
#
# Assemble the cavi-ai/claude-obsidian monorepo from this fork.
#
# This fork (sasan1200/html-effectiveness) currently holds BOTH Thariq's
# original HTML gallery (at the repo root) and our additions
# (obsidian-plugin/, claude-plugin/). The target monorepo separates the two:
# our code lives at the top level, and Thariq's pristine gallery is pulled in
# as a PINNED git submodule so it is never modified in place and remains
# clearly his work.
#
# Run this from an empty checkout of the (already-created) target repo, OR let
# it create a fresh working copy. It does NOT push — review, then push yourself.
#
# Prereqs: the target repo cavi-ai/claude-obsidian exists and you can push to
# it. git >= 2.13.

set -euo pipefail

# --- configuration -----------------------------------------------------------

TARGET_REMOTE="${TARGET_REMOTE:-git@github.com:cavi-ai/claude-obsidian.git}"
# Last "pure Thariq" commit on the fork — only the HTML gallery + project docs,
# before any Obsidian-plugin work. The submodule is pinned here.
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-https://github.com/sasan1200/html-effectiveness.git}"
UPSTREAM_PIN="${UPSTREAM_PIN:-58c305b}"
# Where this fork is checked out (source of obsidian-plugin/ and claude-plugin/).
FORK_DIR="${FORK_DIR:-$(pwd)}"
WORK="${WORK:-./claude-obsidian-monorepo}"

# --- assemble ----------------------------------------------------------------

echo "==> Creating working tree at $WORK"
rm -rf "$WORK"
git init -q "$WORK"
cd "$WORK"
git remote add origin "$TARGET_REMOTE"

echo "==> Copying our code (obsidian-plugin/, claude-plugin/, NOTICE, README)"
cp -R "$FORK_DIR/obsidian-plugin" ./obsidian-plugin
cp -R "$FORK_DIR/claude-plugin"   ./claude-plugin
cp     "$FORK_DIR/NOTICE"         ./NOTICE
# Drop build output / deps that should not be vendored.
rm -rf obsidian-plugin/node_modules obsidian-plugin/main.js

echo "==> Adding Thariq's gallery as a pinned submodule at upstream/html-effectiveness"
git submodule add "$UPSTREAM_REMOTE" upstream/html-effectiveness
git -C upstream/html-effectiveness checkout -q "$UPSTREAM_PIN"
git add .gitmodules upstream/html-effectiveness

echo "==> Writing top-level README pointer"
cat > README.md <<'EOF'
# claude-obsidian

Cowork with Claude inside your Obsidian vault.

- **obsidian-plugin/** — Claude Companion, the Obsidian community plugin.
- **claude-plugin/** — the Claude Code plugin + marketplace (commands, skills,
  MCP bridge config).
- **upstream/html-effectiveness/** — Thariq Shihipar's original "HTML is all you
  need" gallery, pinned as a submodule (unmodified). See NOTICE for attribution.

Clone with submodules: `git clone --recurse-submodules <url>`
EOF

git add -A
git commit -q -m "Initial import: Claude Companion + claude-obsidian plugin

Our code (obsidian-plugin/, claude-plugin/) imported from the
html-effectiveness fork. Thariq Shihipar's original HTML gallery is included
as a pinned submodule at upstream/html-effectiveness (commit $UPSTREAM_PIN),
unmodified. See NOTICE for attribution."

echo "==> Done. Review, then: git -C $WORK push -u origin main"
