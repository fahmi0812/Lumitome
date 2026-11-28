---
description: /loopdesign — perbaiki desain berulang lewat state machine DRAFT -> MEASURE -> GATE -> CRITIC -> PATCH -> DONE | HALT (maks N iterasi, default 3).
---
Jalankan skill `loopdesign` sesuai `.opencode/skills/loopdesign/SKILL.md`. Sintaks: `/loopdesign [N]`.

Alur deterministik wajib:
- Driver: `harness/design-loop.mjs` (`runDesignLoop` / `stepDesignLoop`) dengan state `DRAFT -> MEASURE -> GATE -> CRITIC -> PATCH -> DONE | HALT`.
- State loop disimpan di `<workspace>/.tmp/loopdesign/loop-history.jsonl` (nol `/tmp`).
- Kritikus visual: panggil subagent `design-critic` (`.opencode/agents/design-critic.md`) hanya dengan paket bersih hasil `criticInput()` (plus `comparePairwise()` bila iterasi > 1), bukan `reviewer`.
- Terminasi `DONE`: hanya jika Design-Gate, Behavior Probe, dan Done-Gate seluruhnya lolos.
