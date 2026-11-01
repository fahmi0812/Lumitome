# Swanwright

> Catatan: file ini dan `.opencode/rules/*` bisa basi. Bila bertentangan dengan kode/tes, ikuti kode dan laporkan drift (`.opencode/rules/00-doc-code-drift.md`). Rule keamanan tetap berlaku.

Lapisan non-invasif di atas OpenCode. Jangan patch core OpenCode. Model hanya via 9router (`127.0.0.1:20128`).

## Perintah
- `npm run validate` — cek skill, registry, JSONC
- `npm test` — suite (Node ≥ 22)
- `npm run scan` — osv-scanner v2.7.0 + gitleaks v8.30.1 (UNRUN bila biner tidak ada)
- `npm run enable-pack -- <nama>` — salin pack ke `.opencode/skills` + validasi (`-- <nama> --disable` untuk mencabut)
- `npm run sync-upstream` — re-fetch skill dari SHA ter-pin

## Larangan keras
1. Jangan `git push` ke `main` / jangan buka PR otomatis (Fahmi yang buka PR).
2. Jangan LiteLLM / proxy selain 9router.
3. `/pentest` wajib `--pentest` + file consent + scope.
4. Klaim DONE tanpa FACT (perintah+exit/hash) ditolak Done-Gate.

## Struktur
`.opencode/` agents·commands·plugins·skills·rules · `router/` · `harness/` · `packs/` · `docs/` · `tests/`

Baca `docs/PRD.md` dan `ARCHITECTURE.md` (root) sebelum mengubah arsitektur.

## v0.1.6 — Skill Query Layer & MCP per sektor
- Routing skill: `node scripts/skill-query.mjs "<tugas>"` (≤5 skill). Indeks: `npm run skills:index` (otomatis bila hash berubah).
- Ubah pemetaan MCP/skill sektor → edit `router/mcp-sectors.json` / registry lalu `npm run policy` (jangan edit `permissions` agent manual).
- Jangan jalankan `codebase-memory-mcp install|update`; jangan tulis token ke file (pakai `{env:...}` + `~/.swanwright/secrets.env`).
