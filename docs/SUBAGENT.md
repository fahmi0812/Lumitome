# /subagent: role delegation

`/subagent` lets the orchestrator agent hand each part of a task to a role
that runs on its own 9router model. This page holds the details that used to
live in the README.

## The roles

There are four roles: Thinking, Search, Build, and Review.
They are always all active; there is no per-role on/off switch. You choose which 9router model each
role uses, and whether roles run in serial or parallel mode.

## The popup

In the TUI (orchestrator agent), type `/subagent` to open the popup. It is a
real TUI plugin dialog (`lumitome/config/plugins/subagent/`).

- By default it asks one question at a time (Stage A, sequential selects).
- `/subagent tabel` opens a one-screen roles × model table instead (Stage B).
  Use the arrow keys and Enter, Ctrl+S saves, Esc cancels. The [✓] on each row
  only shows that the role is active.

## What saving does

Saving switches the current session's model to the Thinking role's model, so
the status line shows the model you picked as Thinking.

New sessions created afterwards start with the Thinking model too. Two parts
make that happen: the wrapper's TUI default follows the preset, and the server
plugin switches new sessions on `session.created`. A session created with an
explicit model keeps it. Subagent children are switched to their own role's
model instead (v0.3.76).

After saving, one last question asks whether to enter subagent mode now:

- **"Ya, mulai"** opens a new subagent session with the Thinking model, or
  switches the active session to it in place. No TUI restart is needed.
- **"Simpan saja"** only saves the configuration.

A short confirmation (mode, role order, Thinking model, and task, at most two
lines) is sent to the session only if it was already running before the save.
A newly created session gets no injected message. It reads the configuration
from the "Konfigurasi aktif" block in `.opencode/rules/subagent.md` instead.

## Where the rules and settings live

- The full delegation rules (role order, BLOCKED protocol, two-axis review) are
  in `.opencode/rules/subagent.md`, not in an injected prompt.
- Those rules are switched on by the "Mode /subagent saat ini" line in
  `.opencode/agents/orchestrator.md`. `lumitome subagent-preset` keeps that line
  in sync (serial/parallel when on, OFF when off), and also keeps the
  "Konfigurasi aktif" block (role→model mapping, order, mode) in sync.
- Your choice is saved to `~/.lumitome/lumitome-subagent.json`. The repo file
  `.opencode/lumitome-subagent.json` is only the default seed: it is copied
  there once on first use and never overwritten by updates.

When changes take effect:

- Mode changes apply immediately.
- Role model changes apply immediately to subagent children created afterwards
  (the server plugin switches them on `session.created`, v0.3.76).
- New main sessions pick up role model changes from the next TUI session.

Workers never ask you questions directly. A worker that gets stuck reports
BLOCKED to the orchestrator.

## Turning it off

- `/subagent off` disables the role system entirely. There is no popup, and the
  orchestrator works as it did before, without role delegation.
- `/subagent on` turns it back on.

Default is on. A fresh install behaves exactly as before `/subagent` existed:
the system stays dormant until you call it.

Headless runs (`lumitome run`) have no popup. Manage roles there with
`lumitome subagent-preset status|on|off`.

## How delegation is enforced (v0.3.70)

Delegation is enforced in plugin code, not only requested in a rules file.
While subagent mode is on, the server plugin:

- removes the orchestrator's direct tools (edit, write, shell, execute, and
  similar) from every model request, and denies them in the orchestrator's
  permissions, so the only executable path is the built-in `subagent` tool;
- injects a short delegation protocol (a role table keyed by task verb) into
  every model call;
- rejects any direct mutating call that still slips through.

Role descriptions start with their trigger ("Pemicu: …") and do not overlap.

Delegation is measured. The plugin appends per-call and per-turn records to
`$LUMI_HOME/subagent-metrics.jsonl`, and `node scripts/subagent-metrics.mjs`
summarizes the delegation rate per session.

There is deliberately no automatic re-drive when a turn ends without
delegating. OpenCode 2.3.0 has no blocking Stop hook, and an event-driven
re-prompt would race user input. Set `LUMI_SUBAGENT_DEBUG=1` to log hook event
shapes into the same metrics file.
