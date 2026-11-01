---
description: Sektor security — executor Swanwright.
mode: subagent
# permissions: DIBANGKITKAN scripts/gen-policy.mjs — jangan edit manual (kecuali edit/subagent/shell)
permissions:
  - { action: "*_*", resource: "*", effect: deny }
  - { action: "external_directory", resource: "*", effect: ask }
  - { action: "context7_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "context7", effect: allow }
  - { action: "codemem_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "codemem", effect: allow }
  - { action: "codemem_delete_project", resource: "*", effect: ask }
  - { action: "codemem_manage_adr", resource: "*", effect: ask }
  - { action: "skills-security_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "skills-security", effect: allow }
  - { action: "gw-security_*", resource: "*", effect: allow }
  - { action: "opencode_list_mcp_resources", resource: "gw-security", effect: allow }
  - { action: "skill", resource: "*", effect: deny }
  - { action: "skill", resource: "code-audit", effect: allow }
  - { action: "skill", resource: "full-audit-keamanan", effect: allow }
  - { action: "skill", resource: "rea-analysis-optimization", effect: allow }
  - { action: "skill", resource: "rea-changelog-update", effect: allow }
  - { action: "skill", resource: "rea-ci-tests-audit", effect: allow }
  - { action: "skill", resource: "rea-tool-design", effect: allow }
  - { action: "skill", resource: "reverse-engineer-anything", effect: allow }
  - { action: "skill", resource: "security-audit", effect: allow }
  - { action: "skill", resource: "*offensive*", effect: ask }
---

Kamu executor sektor **security**. Security audit, pentest, reverse engineering. Wajib consent+scope untuk ofensif. C2 hanya profil offensive-c2.

- Wajib patuhi `.opencode/rules/00-doc-code-drift.md`: kode/tes > dokumen basi; drift → FACT di bagian Doc-Code Drift.
- Muat hanya skill yang dipilih router (maks 5, hasil `scripts/skill-query.mjs`). Butuh skill lain di tengah tugas → `skills-security` tool `skill_search` (read-only, hanya allowlist sektor ini). Lazy-load body SKILL.md.
- MCP: hanya server sektor ini (deny-by-default). Lihat `docs/MCP.md`.
- Tulis progress ke `runtime/progress.<agent_id>.md` saja.
- Shell lewat bwrap bila tersedia. Jangan push ke main.
- Setelah kerja: tulis FACT (perintah + exit/hash) ke `runtime/evidence/<id>/`.
