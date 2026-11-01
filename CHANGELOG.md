# Changelog

## 0.3.0 — Lumitome (repo mandiri)
- Rebrand ke **Lumitome**; installer `fahmi0812/Lumitome`, `LUMI_HOME=~/.lumitome`, launcher `~/.local/bin/lumitome`, `install.sh --uninstall`.
- Engine OpenCode v2.2.4 terpin + SHA256, terisolasi (XDG_* sendiri), autoupdate mati, `lumitome engine` / `upgrade-engine`.
- Proyek untrusted by default (`LUMI_TRUST_PROJECT=1` opt-in); serve password 0600 tanpa cetak.
- Fail-fast provider (preflight, watchdog 90 s, deadline 5 menit, kill eskalasi).
- 4 skill finance dasar; router fallback top-3, L1 cache/compact (opt-in); permintaan trading tanpa skill.
- Guard: daftar nama `.env*` boleh; anti-spin per-signature; done-gate mendeteksi exit tes yang disamarkan.


## 0.1.6 — 2026-10-31 — Arsitektur final (disetujui Fahmi)
Basis v0.1.5 (backup `pkg.bak-0.1.5`). OpenCode **v2.2.4**. Skill aktif tetap **82**; api-security & llm-security tetap nonaktif. Riset acuan: `swanwright-research/REPORT.md`, `MCP-REPORT.md`.

### Skill Query Layer (desain v0.2 fase 1)
- `router/skill-db.mjs` (tanpa dependensi wajib; `node:sqlite`): tabel `skill`, `skill_fts` (FTS5 BM25), `skill_vec` (sqlite-vec 0.1.9, optionalDependency, hanya bila ada embedding), `agent_policy`, `allowed_skill`, `skill_edge`, `route_log`, `meta`.
- Filter SQL sektor/pack/status/izin SEBELUM ranking → query ganda → BM25 (+vec) → RRF k=60 → dedup (61 duplikat pack) → top-24 (16–32) → 1 panggilan 9router pilih-saja (≤5, JSON tervalidasi) → fallback deterministik bila 9router mati → `route_log`.
- `scripts/skill-index.mjs --if-changed|--check` (rebuild saat hash berubah), `scripts/skill-query.mjs`, `scripts/skill-metrics.mjs` (recall@k, top-1, MRR, zero-load, latensi).
- `router/skill-search-mcp.mjs`: MCP stdio read-only `skill_search`, satu server per sektor (`skills-<sektor>`).
- `router/layer1-select.md`: prompt pilih-saja. Layer-0 tidak diubah (golden 154, 0 mismatch).

### MCP per sektor
- `router/mcp-sectors.json` + `scripts/gen-policy.mjs` → frontmatter `permissions` 10 agent: `*_*` deny → `external_directory` ask → allow server sektor sendiri; `codemem_delete_project`/`manage_adr` = ask; tool tulis github = ask; skill: deny `*` lalu allow allowlist sektor.
- Server: context7 4.4.4, codemem (codebase-memory-mcp v0.12.1, didaftarkan manual), playwright-mcp 0.0.83, chrome-devtools-mcp 1.12.0, markitdown-mcp 0.0.1a8 (aktif); figma remote (OAuth) & github remote (token env) **mati**; `gw-<sektor>` gateway opsional **mati** (template Docker MCP Gateway & ContextForge di `config/mcp-gateway/`). Tanpa Kali, tanpa trading.
- Global: deny `codebase-memory-mcp install|update`; plugin juga memblok. Provider 9router sekarang `{env:SW_9ROUTER_URL}`/`{env:SW_9ROUTER_KEY}`.
- `checkMcpPolicy` di validate: token literal, `@latest`, paket tak dipin, figma/github/gateway enabled, server terlarang, Code Mode dimatikan → FAIL.

### Pemasangan
- `install.sh` (Linux/macOS/WSL2; Windows native ditolak dengan instruksi WSL): OpenCode v2.2.4, Node 22.23.4, codebase-memory-mcp v0.12.1, uv 0.13.6 — SHA256 terpin + file checksum rilis; `~/.swanwright/{bin,env.sh,secrets.env(600)}`; `npm ci`; bangun indeks; idempoten; tidak menulis `~/.config/opencode`.
- `scripts/doctor.sh` (`bash install.sh --doctor`): skill=82, MCP connected, plugin active, agents, skill_search, 9router. `scripts/e2e-opencode-v2.sh` kini memanggil doctor.

### Dokumen
- `ARCHITECTURE.md` (root, final) + `docs/diagrams/{arsitektur,orchestrator}-final.{mmd,png}`, `docs/MCP.md`, `docs/MCP-GATEWAY.md`, `docs/VERIFY-OPENCODE.md` (output mentah v0.1.6).
- Tes 59 → 83.

### Isu diketahui
- Layer-1 nyata (9router) & embedding semantik belum diuji: 9router tidak hidup di box. Metrik = retrieval tanpa L1.
- Gateway (Docker/ContextForge) belum diuji (tanpa Docker di box); endpoint `/mcp` & token = [VERIFIKASI].
- figma/github tidak diuji (butuh OAuth/token).

## 0.1.5 — 2026-10-31
### Migrasi ke OpenCode v2 (disetujui Fahmi)
Diuji pada **OpenCode v2.2.4** (rilis GitHub anomalyco/opencode `v2.2.4`, 2026-10-30 23:59 WIB; tarball `opencode-linux-x64.tar.gz`, SHA256 cocok `SHA256SUMS`). Catatan: npm `opencode-ai@latest` masih 1.19.5; paket v2 = `@opencode/cli` / `@opencode/plugin` 2.2.4.

Sumber: https://opencode.ai/v2/docs/migrate-v1/ , https://opencode.ai/v2/docs/build/plugins/migrate-v1/ , https://opencode.ai/v2/docs/skills/ , /v2/docs/permissions/ , /v2/docs/mcp-servers/ , /v2/docs/agents/ , /v2/docs/plugins/ .

Breaking change v2 yang berdampak ke Swanwright:
- **Plugin API** (breaking resmi): plugin V1 (`export const X = async () => ({"tool.execute.before": …})`) tidak jalan di v2. → `swanwright.ts` kini `export default` `{ id: "swanwright", setup(ctx) { ctx.tool.hook("execute.before", guardPushMain) } }`; event `{tool, input}`; nama tool `shell` (alias `bash` tetap dicek).
- **Permissions**: map `permission` → array berurutan `permissions: [{action, resource, effect}]`; `bash`→`shell`, `task`→`subagent`, `write/patch`→`edit`. `external_directory` default v2 = allow → Swanwright set eksplisit `ask`. Tambahan deny `shell git push *main*|*master*`.
- **Agents**: frontmatter `permission` → `permissions` (orchestrator: deny edit `task_plan.md`/`findings.md`, allow `subagent *`).
- **MCP**: server pindah ke `mcp.servers.<nama>`, `enabled` → `disabled`, `timeout: {catalog, execution}`.
- **Providers**: `provider/npm/options` → `providers/package: "aisdk:@ai-sdk/openai-compatible"/settings` (9router tetap satu-satunya provider).
- Skills: lokasi `.opencode/skills/<id>/SKILL.md` tetap; v2 memakai nama folder sebagai id (aturan nama=folder dipertahankan sebagai lint).
- Lokasi config tidak berubah; skema `https://opencode.ai/config.json` gabungan V1+V2 (field V1 `deprecated`). `tui.json`→`cli.json` tidak dipakai Swanwright.

Perubahan lain:
- `scripts/check-opencode.mjs`: `checkV2Config` (tolak kunci V1 `permission/agent/mode/provider/plugin/command/tools`, `mcp.<nama>` langsung, `enabled`), agents tolak `permission/tools/prompt`, plugin wajib `export default` + `id` + `setup`.
- `scripts/e2e-opencode-v2.sh`: E2E nyata via `opencode serve` + HTTP API (`/api/skill`, `/api/mcp`, `/api/plugin`).
- Tes 54 → 59. Skill aktif tetap **82** (tidak dipotong/ditambah); api-security & llm-security tetap nonaktif. Rules, done-gate, scan-gate, routing (golden 154, 0 mismatch) tidak berubah.

### Isu diketahui
- `opencode mcp list` / `opencode plugin list` (CLI v2.2.4) mencetak "No MCP servers configured" / "No plugins found" untuk config proyek, padahal API server untuk direktori yang sama melaporkan context7 `connected` & plugin `active`. Verifikasi pakai API.
- Hook push-main di-tes unit (mock `ctx.tool.hook`); belum dipicu lewat sesi model nyata (butuh 9router hidup).

## 0.1.4 — 2026-10-31
### Dipulihkan (disetujui Fahmi)
- Catatan koreksi: v0.1.1 memangkas skill aktif 83 → 48 **tanpa persetujuan Fahmi** (demi target token indeks). v0.1.4 memulihkan cakupan: 34 skill dipindah dari pack ke `.opencode/skills` → **82 aktif** (target 84; 2 ditolak, lihat bawah).
- coding (workflow): brainstorming, code-review, requesting-code-review, receiving-code-review, finishing-a-development-branch, dispatching-parallel-agents, git-guardrails-claude-code, improve-codebase-architecture, correct, reflect, poteto-mode, in-your-own-words, react, next, skill-creator.
- coding (design UI): design-taste-frontend, emil-design-eng, hallmark, magic-ui, gsap-core, gsap-scrolltrigger.
- security: code-audit (SAST defensif).
- riset: research, figure-it-out, interrogate. penulisan: doc-coauthoring, laporan-generator, internal-comms, technical-writer. media: motion-design, video-demo, sound-design, web-sims, review-loop.
### Tidak diaktifkan
- `api-security`, `llm-security` (zhaoxuya520/reverse-skill): ofensif — langkah serangan aktif (JWT alg:none, brute force, bypass rate-limit/DoS; payload prompt-injection, "simulasi serangan red team", cari teknik eksploit terbaru) dan instruksi "langsung eksekusi, jangan berhenti di konfirmasi". Tetap di pack `red-team` (butuh consent+scope).
### Routing
- Registry: entri baru dengan champion/fallback, trigger spesifik, deskripsi ringkas Indonesia, `activated_in`, `from_pack`. Indeks dikelompokkan per sektor (~1.470 token).
- Layer-0: 16 rule baru (media/penulisan/riset/security/coding) + skillsHint. GSAP di-route ke executor `media` agar golden lama `media-05/10/15/20` tetap benar; skill gsap-* tetap tercatat sektor coding.
- Golden 134 → 154 (20 kasus `v014-*` dengan `expect_skill`); tes strict: 0 mismatch + semua skill baru ter-route. Tes 52 → 54.
- Docs: sektor finance belum punya skill (tanpa sumber).

## 0.1.3 — 2026-10-31
### Diperbaiki (BUG: tidak ada skill/MCP yang dimuat OpenCode)
- 611 folder skill (aktif + pack) diganti nama = frontmatter `name`, valid regex OpenCode; bentrok diberi sufiks unik; frontmatter dinormalisasi (YAML valid, deskripsi 1–1024). Provenance di registry (`original_id`, `original_name`, `src`, `sha`), katalog, NOTICE, `metadata` frontmatter.
- `opencode.jsonc` mengikuti skema resmi: `mcp.<nama>.{type:"local", command:[...]}`; hapus `mcp.timeout`/`mcp.servers`; hapus `plugin: file://folder`; tambah `instructions` (rules 00–05), `default_agent: orchestrator`, `provider.9router.models`, izin bash deny `git push*main*`.
- Plugin dipindah ke `.opencode/plugins/swanwright.ts` (format resmi `export const X: Plugin = async () => hooks`, hook `tool.execute.before`), hanya import tipe `@opencode-ai/plugin`.
- Orchestrator: `permissions` (tak dikenal) → `permission`. Hapus folder sampah `.opencode/agents/{sectors}`.
### Ditambahkan
- `scripts/check-opencode.mjs` + validate: FAIL bila folder≠name, regex/panjang tidak valid, YAML frontmatter rusak, nama duplikat, config gagal skema https://opencode.ai/config.json (ajv 8.20.0, snapshot skema di `scripts/schema/`), agent/plugin tidak valid.
- `scripts/enable-pack.mjs`: salin pack ke `.opencode/skills` + validasi; `--disable` untuk mencabut.
- Verifikasi E2E nyata dengan OpenCode 1.19.5: `docs/VERIFY-OPENCODE.md` (48 skill, context7 connected, plugin dimuat, agent tampil).
- Tes 42 → 52. devDependencies: ajv 8.20.0, yaml 2.9.1. `@opencode-ai/plugin` 1.19.5 sengaja TIDAK dipasang: hanya import tipe (dihapus saat strip-types), dan dependensi transitifnya (toml 4.3.0 via effect, zod 4.1.8) kena CVE HIGH ber-fix per osv-scanner 2026-10-31.

## 0.1.2 — 2026-10-30
### Diperbaiki
- Layer0: 8 mismatch golden (riset-02/04/07/09/12/14/17/19) → 0. Penyebab: regex penulisan `\bpaper\b` terlalu luas sehingga "cari sumber paper"/"rangkum paper" masuk penulisan. Tambah rule riset (cari/rangkum/ringkas/survei/telaah/bandingkan + ≤3 kata + paper/jurnal/literatur) sebelum rule penulisan. Ekspektasi golden tidak diubah (sudah benar: mencari/merangkum paper = riset).
### Ditambahkan
- Tes strict: golden layer0 harus 0 mismatch; tes "tulis paper" tetap penulisan, "rangkum paper" → riset. Total 42 tes.

## 0.1.1 — 2026-10-30
### Ditambahkan
- Rule sektor coding `.opencode/rules/06-coding-karpathy.md` (≤150 token): kode minimal, perubahan bedah, asumsi headless sebagai `JUDGMENT:`, verifikasi via done-gate. Sumber multica-ai/andrej-karpathy-skills @2c606141936f1eeef17fa3043a72095b4765b9c2 (MIT).
- `harness/scan-gate.ts` + `npm run scan`: osv-scanner v2.7.0 (lockfile/manifest) dan gitleaks v8.30.1 (diff+staging). FAIL untuk CVE CRITICAL/HIGH ber-fix atau secret; MEDIUM ke bawah WARN; biner hilang UNRUN + instruksi instalasi.
- Done-gate: `sector`, `scanGate`, `changedFiles`, `taskScope`; diff-scope di luar scope → WARN (bukan blok); `warnings[]` di hasil.
- Allowlist `osv-scanner.toml` dan `.gitleaks.toml` (wajib reason/description, dicek validate). `docs/SCAN-GATE.md`.
- Layer0: kata kunci Karpathy → sektor coding + rule 06. 4 golden case baru (134 total).
- Tes: 7 → 40 (rule coding, scan PASS/FAIL/UNRUN/WARN via mock+fixture, diff-scope WARN, golden tanpa regresi, doc-code drift).
- Rule global Doc-Code Drift `.opencode/rules/00-doc-code-drift.md` (kalimat verbatim dari arXiv:2610.30571): prioritas user > kode/tes > dokumen; rule keamanan tak bisa ditimpa; drift dilaporkan sebagai FACT di bagian "Doc-Code Drift"; dimuat orchestrator + sektor coding/security (finance/media bila menyentuh kode). Catatan "bisa basi" di AGENTS.md dan rules/01.
- `harness/doc-drift.ts`: deteksi drift deterministik (print/logging, os.path/pathlib, dst.) dengan file:baris; WARN bila kode lulus tes ditulis ulang demi dokumen. `docs/DOC-CODE-DRIFT.md`.
### Diubah
- `karpathy-guidelines` → pack `coding-extra` (champion false, tetap di-vendor, atribusi tetap).
- 35 skill aktif → pack (duplikat impeccable/ui-ux-pro-max, skill jarang). Aktif 83 → 48.
- Deskripsi indeks dipersingkat (Bahasa Indonesia). Indeks aktif ~2.847 → ~1.054 token.
- osv-scanner: hasil di `packs/` dan `.opencode/skills/` (skill vendored) dilewati; `.gitleaks.toml` mengecualikan `packs/red-team/` (payload contoh vendored) dengan alasan.
- Validate: cek path skill pack, indeks vs registry, token rule 06, allowlist beralasan.

## 0.1.0
- Rilis awal.
