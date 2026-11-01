# Verifikasi E2E — Swanwright v0.1.6 (OpenCode v2.2.4)

Dijalankan 2026-10-31 ~04:40 WIB di box Linux x64: ZIP final diekstrak ke folder kosong `/tmp/e2efinal`, `HOME=/tmp/swhomeF` baru, `PATH=/usr/bin:/bin` (node sistem v20 → installer memasang Node 22.23.4). Semua alat diunduh nyata oleh `install.sh` dan diverifikasi SHA256.
Metode cek OpenCode: `opencode serve` + `GET /api/skill|/api/mcp|/api/plugin?directory=<proyek>` (CLI `mcp list`/`plugin list` v2.2.4 kosong untuk config proyek — isu v0.1.5).

## Perintah
```bash
bash install.sh
source ~/.swanwright/env.sh && bash install.sh --doctor
npm test && npm run validate && npm run scan && npm run skills:metrics
```

## Output mentah
```
[swanwright] Swanwright 0.1.6 · linux-x64 · SW_HOME=/tmp/swhomeF/.swanwright · proyek=/tmp/e2efinal
[swanwright] 1/6 OpenCode v2.2.4
  OK   SHA256 terverifikasi opencode-linux-x64.tar.gz
  OK   opencode v2.2.4
[swanwright] 2/6 Node.js (>= 22.6)
  OK   SHA256 terverifikasi node-v22.23.4-linux-x64.tar.gz
  OK   node v22.23.4 → /tmp/swhomeF/.swanwright/node-v22.23.4-linux-x64
  OK   SQLite bawaan node: FTS5 tersedia
  WARN sqlite3 CLI tidak ada (opsional; untuk inspeksi runtime/skills.db: apt install sqlite3 / brew install sqlite)
[swanwright] 3/6 codebase-memory-mcp v0.12.1
  OK   SHA256 terverifikasi codebase-memory-mcp-linux-amd64.tar.gz
  OK   codebase-memory-mcp 0.12.1 (didaftarkan manual sebagai 'codemem'; 'install' tidak dijalankan)
[swanwright] 4/6 uv/uvx (markitdown-mcp)
  OK   SHA256 terverifikasi uv-x86_64-unknown-linux-gnu.tar.gz
  OK   uv 0.13.6 (x86_64-unknown-linux-gnu)
[swanwright] 5/6 /tmp/swhomeF/.swanwright/env.sh
  OK   tulis env.sh; secrets.env (600) tidak pernah masuk repo
[swanwright] 6/6 proyek /tmp/e2efinal

added 8 packages in 488ms
  OK   npm ci
skill-index: dibangun runtime/skills.db active=82 pack=361 disabled=168 embed=none dim=0 hash=b6b9ab11e38c
gen-policy: OK
  OK   precache markitdown-mcp
[swanwright] Selesai. Berikutnya:  source /tmp/swhomeF/.swanwright/env.sh && bash install.sh --doctor
[swanwright] Swanwright 0.1.6 · linux-x64 · SW_HOME=/tmp/swhomeF/.swanwright · proyek=/tmp/e2efinal
[PASS] opencode v2.2.4
[PASS] node v22.23.4
[PASS] codebase-memory-mcp 0.12.1
[PASS] uvx ada
[PASS] indeks skill FRESH (runtime/skills.db)
[PASS] permissions agent sinkron (gen-policy)
[WARN] repo git belum ada → dibuat lokal (tanpa remote)
[PASS] skill proyek terlihat OpenCode = 82 (target 82; total 85 termasuk builtin)
[PASS] api-security/llm-security tidak aktif
[PASS] MCP context7: connected
[PASS] MCP codemem: connected
[PASS] MCP skills-coding: connected
[PASS] MCP skills-media: connected
[PASS] MCP skills-riset: connected
[PASS] MCP skills-penulisan: connected
[PASS] MCP skills-security: connected
[PASS] MCP skills-finance: connected
[PASS] MCP playwright: connected (opsional)
[PASS] MCP chromedev: connected (opsional)
[PASS] MCP markitdown: connected (opsional)
[INFO] MCP disabled (default): figma, github, gw-coding, gw-finance, gw-media, gw-penulisan, gw-riset, gw-security
[PASS] plugin swanwright: active
[PASS] agents Swanwright 10/10
[PASS] skill_search(coding, 'tdd unit test gagal') → tdd-red-green-refactor
[WARN] 9router tidak terjangkau (http://127.0.0.1:20128/v1) — Layer-1 pakai fallback deterministik
doctor: 0 FAIL, 2 WARN
DOCTOR_EXIT=0
83 passed, 0 failed
OK (warns 0)
FACT: scan-gate PASS (osv-scanner+gitleaks)
golden=154 L0-mismatch=0 gold-cases=96 embed=none
top-1=0.7813 recall@5(any)=0.9167 recall@5(frac)=0.8264 cand-recall@16=0.9167 @32=0.9167 MRR=0.842 zero-load=0
retrieval p50=0.34ms p95=0.76ms misses@5=8
```
