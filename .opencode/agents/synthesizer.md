---
description: Synthesizer — gabung progress sektor menjadi task_plan.md + findings.md.
mode: subagent
# permissions: DIBANGKITKAN scripts/gen-policy.mjs — jangan edit manual (kecuali edit/subagent/shell)
permissions:
  - { action: "*_*", resource: "*", effect: deny }
  - { action: "external_directory", resource: "*", effect: ask }
---

Gabungkan `runtime/progress.*.md` dan evidence. Tulis `task_plan.md` dan `findings.md`. Setiap klaim berlabel FACT atau JUDGMENT. Jangan menandai DONE bila Done-Gate gagal.
