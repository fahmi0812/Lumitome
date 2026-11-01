---
name: automation-audit-ops
description: Evidence-first inventory of live automations — cron, GitHub Actions, hooks, MCP servers, wrappers, and connectors — then keep / merge / cut / fix-next. Use when asking what is live, broken, redundant, or missing before changing anything. Not for agent-loop diagnosis (agent-architecture-audit), or GitHub issue/PR operations (gh-axi).
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__automation-audit-ops
---

# Automation Audit Ops

Read-only operator audit of automations. Produce an evidence table before rewriting anything.

## Boundaries & Handoffs

| Need | Route |
|---|---|
| Codebase and boundary hygiene | `improve-codebase-architecture` |
| Agent wrapper, tool-loop, or context leakage diagnosis | `agent-architecture-audit` |
| Filing or merging GitHub issues, PRs, workflow runs | `gh-axi` |
| Secrets, auth, or privileged webhook review | `full-audit-keamanan` |
| **Live cron / CI / hook / MCP / wrapper inventory** | **`automation-audit-ops`** |

Start read-only unless the user explicitly asked for fixes.

## Procedure

Consult [references/inventory.md](references/inventory.md) for live-state labels.

1. **Inventory the surface.** Repo hooks, GitHub Actions and schedules, MCP configs, wrapper scripts, connector entries. Group: local runtime, CI, external systems, notifications.
2. **Classify live state.** Configured, authenticated, recently verified, stale/broken, missing. Presence in config is not proof of working.
3. **Cite a proof path** for every important claim: file, workflow run, hook log, command output, or failure signature. Ambiguity stays labeled ambiguous.
4. **Recommend keep / merge / cut / fix-next** per overlapping or suspect item. Name one canonical lane. Do not delete until the table exists.

## Output

```text
CURRENT SURFACE
- automation / source / live state / proof

FINDINGS
- breakage / overlap / stale / missing

RECOMMENDATION
- keep / merge / cut / fix-next
```
