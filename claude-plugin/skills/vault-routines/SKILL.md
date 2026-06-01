---
name: vault-routines
description: Use when a vault task produces recurring value, when the user asks to automate or repeat a vault workflow on a schedule, or after delivering a result the user will want regularly.
---

# Vault routines

Turn a one-off vault result into an editable, scheduled routine. Claude Code can
already run scheduled remote agents (cron-based, editable, cloud-dispatched) —
you leverage that machinery; you do not build scheduling yourself.

## When a result has recurring value

After producing something the user will want again on a cadence (a weekly
review, a vault health sweep, a Monday task pull, a new-papers digest), offer a
routine. Phrase it as a concrete, editable proposal — never schedule silently.

> "This is useful on a cadence. Want me to set it up as a routine — e.g. every
> Monday 8am? It runs as a cloud session and you can edit or cancel it anytime."

## Rules

1. **Consent first.** Never create a schedule without the user agreeing to it.
2. **Concrete cadence.** Propose a specific time/frequency tied to the task, not
   "regularly."
3. **Editable + cancellable.** Tell the user the routine is editable and how it
   runs (cloud session), so it never feels like a black box.
4. **Scope the routine.** A routine re-runs the same skill against the live
   vault. State exactly what it will do each run and where output lands.

## Wiring it

Use Claude Code's scheduled-remote-agent / routine mechanism (the `/schedule`
machinery) to register the agreed cadence with the command or skill invocation
that produced the result. Confirm back the schedule, its next run, and how to
edit it.
