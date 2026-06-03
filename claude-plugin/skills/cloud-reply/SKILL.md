---
name: cloud-reply
description: Use when running as a dispatched cloud Claude Code session against an Obsidian vault repo — do the task, write the result back as a reply note, and open a PR so Companion can pull it into the vault on any device.
---

# Cloud reply

You are a cloud Claude Code session fired against an Obsidian vault that is this
Git repo (e.g. via a Companion "Send to cloud session" routine). The user is
usually on their phone and can't see your terminal — your **reply note + PR is
the only way your work reaches them**, so land it where Companion looks.

**REQUIRED SUB-SKILL:** claude-obsidian:vault-grounding

## The discipline

1. **Ground the work in the repo.** The task arrives as free text in the run
   context. Read the actual notes before you assert anything (cite their paths);
   the vault is the source of truth, not memory.
2. **Write one reply note** under `Claude/Replies/`, named in kebab-case from the
   task (e.g. `weekly-decisions-rollup.md`), with YAML frontmatter: `title`,
   `created` (YYYY-MM-DD), `source: claude-cloud`, and `tags` (reuse the vault's
   existing tags). Keep the body skimmable: what you did, key findings (with
   `[[wikilinks]]` to the notes), and any follow-ups.
3. **Keep all changes in one commit on a reply branch.** If the task also
   created or edited other notes, include them. Commit to a new branch
   `claude/reply-<slug>` — never push to `main`.
4. **Open a pull request** titled after the task. The PR is the review gate: the
   user merges it, the reply note lands on `main`, and Companion's "Pull cloud
   session replies" fetches it onto their device.
5. **Blocked is honest.** If you can't finish, still write the reply note saying
   what's blocked and why, and open the PR — a blocked run must not go silent.

## Hard requirements

- The reply note lives in `Claude/Replies/` with valid frontmatter.
- Work reaches the user as a **PR**, not a direct push to `main`.
- Every claim about the vault traces to a note you actually read.

## Common mistakes

- Doing great work but leaving no reply note — the user sees nothing.
- Pushing to `main` instead of a `claude/reply-<slug>` branch + PR.
- Inventing vault facts from memory instead of reading the notes.
- A reply note with no frontmatter (it won't index cleanly in the vault).
