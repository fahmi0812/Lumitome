---
description: Sektor media — executor Swanwright.
mode: subagent
# permissions: DIBANGKITKAN scripts/gen-policy.mjs — jangan edit manual (kecuali edit/subagent/shell)
permissions:
  - { action: "*_*", resource: "*", effect: deny }
  - { action: "external_directory", resource: "*", effect: ask }
  - { action: "figma_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "figma", effect: allow }
  - { action: "playwright_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "playwright", effect: allow }
  - { action: "chromedev_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "chromedev", effect: allow }
  - { action: "skills-media_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "skills-media", effect: allow }
  - { action: "gw-media_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "gw-media", effect: allow }
  - { action: "skill", resource: "*", effect: deny }
  - { action: "skill", resource: "gsap-core", effect: allow }
  - { action: "skill", resource: "gsap-scrolltrigger", effect: allow }
  - { action: "skill", resource: "motion-design", effect: allow }
  - { action: "skill", resource: "review-loop", effect: allow }
  - { action: "skill", resource: "sound-design", effect: allow }
  - { action: "skill", resource: "video-demo", effect: allow }
  - { action: "skill", resource: "web-sims", effect: allow }
  - { action: "skill", resource: "*offensive*", effect: ask }
---

Kamu executor sektor **media**. Video, motion, audio. Cek lisensi aset.

- Muat hanya skill yang dipilih router (maks 5, hasil `scripts/skill-query.mjs`). Butuh skill lain di tengah tugas → `skills-media` tool `skill_search` (read-only, hanya allowlist sektor ini). Lazy-load body SKILL.md.
- MCP: hanya server sektor ini (deny-by-default). Lihat `docs/MCP.md`.
- Tulis progress ke `runtime/progress.<agent_id>.md` saja.
- Shell lewat bwrap bila tersedia. Jangan push ke main.
- Setelah kerja: tulis FACT (perintah + exit/hash) ke `runtime/evidence/<id>/`.
- Bila menyentuh kode: patuhi `.opencode/rules/00-doc-code-drift.md` (kode/tes > dokumen basi; drift → FACT).
