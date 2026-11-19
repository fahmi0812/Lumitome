# MCP Swanwright v0.1.6 — per sektor, deny-by-default

Sumber pemetaan: `router/mcp-sectors.json` → `scripts/gen-policy.mjs` → frontmatter `permissions` agent.
Aturan OpenCode v2 (https://opencode.ai/v2/docs/permissions/ , /v2/docs/mcp-servers/): aksi MCP = nama tool ternormalisasi `<server>_<tool>`, aturan **terakhir yang cocok menang**, agent rules ditambahkan setelah global.

Pola tiap agent: `{"action":"*_*","effect":"deny"}` → `allow <server>_*` untuk server sektor itu → `ask` untuk tool tulis/destruktif. (v0.3.71: `external_directory: ask` → `allow` — baca/tulis seperti OpenCode biasa; aturan eksplisit ini HARUS ada sesudah `*_*` deny, tanpanya wildcard menelan external_directory.)

| Server | Jenis | Default | Pin | Sektor | Catatan |
|---|---|---|---|---|---|
| context7 | local npx | ON | `@upstash/context7-mcp@4.7.0` | coding, riset, penulisan, security, elephant | docs library; tool baru `query-code` |
| codemem | local biner | ON | codebase-memory-mcp **v0.12.1** (SHA256 + checksums.txt) | coding, security, elephant, goldfish | didaftarkan manual; `install`/`update` diblok (permissions + plugin); `delete_project`, `manage_adr` = **ask** |
| playwright | local npx | ON | `@playwright/mcp@0.0.85 --headless --isolated` | coding, media, riset | browser: `bash install.sh --with-browsers` |
| chromedev | local npx | ON | `chrome-devtools-mcp@1.13.0 --headless --isolated --usageStatistics=false` | coding, media | butuh Google Chrome stable terpasang |
| markitdown | local uvx | ON | `markitdown-mcp==0.0.1a8` | riset, penulisan, finance | konversi dokumen → Markdown |
| figma | remote | **OFF** | `https://mcp.figma.com/mcp` (resmi) | media | OAuth: set `disabled:false`, lalu `opencode mcp auth figma`; butuh seat Dev/Full |
| stitch | remote | **OFF** | `https://stitch.googleapis.com/mcp` | media | API key `X-Goog-Api-Key: {env:STITCH_API_KEY}` (Stitch Settings > API Keys); tool tulis/generate = ask |
| figcraft | local AppImage/CLI | **OFF** | `figcraft-cli` v0.18.1 (storytold/figcraft) | media | headless `figcraft-cli mcp` atau attach `--attach <port>`; confinement `--automation-read-root/write-root` = folder sesi; nyalakan `LUMI_MCP=<default>,figcraft`; v0.18.1: server key tidak lagi dikirim via plain ws |
| platformio | local npx | **OFF** | `platformio-mcp@3.1.0` (jl-codes/platformio-mcp) | coding | stdio `npx -y platformio-mcp@3.1.0 serve`; butuh PlatformIO Core (`pio` di PATH) + board fisik buat flash; profil default `flash_requires_approval`; tool tulis/flash = ask; nyalakan `LUMI_MCP=<default>,platformio`; JANGAN profil `standalone` |
| tableau | local npx | **OFF** | `@tableau/mcp-server@6.0.4` (tableau/tableau-mcp) | riset | stdio `npx -y @tableau/mcp-server@6.0.4`; butuh akun Tableau Cloud/Server + PAT (`TABLEAU_SERVER`, `TABLEAU_SITE_NAME`, `TABLEAU_PAT_NAME`, `TABLEAU_PAT_VALUE` di env) dengan permission "API access"; tool tulis/publish/hapus = ask; nyalakan `LUMI_MCP=<default>,tableau`; Web-only — Desktop authoring TIDAK termasuk, konten harus sudah ter-publish |
| drawio | local npx | **OFF** | `@next-ai-drawio/mcp-server@0.4.15` | penulisan | preview browser lokal; nyalakan `LUMI_MCP=<default>,drawio`; v0.4.15: batas body HTTP 10 MiB + bind 127.0.0.1, `create_new_diagram` diperketat agar tidak menghancurkan diagram yang ada |
| blender | local uvx | **OFF** | `mcp-for-blender==2.2.9` (ahujasid/mcp-for-blender) | media | Claude mengendalikan Blender (bangun scene, render, iterasi); nyalakan `LUMI_MCP=<default>,blender`; butuh Blender terpasang + addon MCP for Blender aktif (`uvx mcp-for-blender install-addon`); **PERINGATAN: `execute_blender_code` menjalankan Python arbitrer di Blender dengan akses penuh user (ask), safe mode OFF default — opt-in via `BLENDER_MCP_SAFE_MODE=1`** |
| github | remote | **OFF** | `https://api.githubcopilot.com/mcp/` | coding (devops) | `Authorization: Bearer {env:GITHUB_PERSONAL_ACCESS_TOKEN}`; tool tulis = ask |
| parallel | remote | **OFF** | `https://mcp.parallel.ai/mcp` | riset | web search/fetch/decisions + research; tanpa key gratis (rate limit, tidak ditagih); `PARALLEL_API_KEY` (env) untuk `web_research` + limit 600/menit; nyalakan `LUMI_MCP=<default>,parallel` |
| skills | local node | ON | `router/skill-search-mcp.mjs` | semua sektor | `skill_search` read-only, allowlist sektor |
| gw-&lt;sektor&gt; (6) | remote | **OFF** | `http://127.0.0.1:8811..8816/mcp` | sektornya saja | gateway opsional, lihat `docs/MCP-GATEWAY.md` |

Tidak dipasang: Kali/offensive MCP, MCP trading (alpaca/ccxt/freqtrade) — `checkMcpPolicy` menolak.
Rahasia: hanya `{env:NAME}` di config; nilai di `~/.swanwright/secrets.env` (chmod 600, di luar repo). `npm run validate` gagal bila ada token literal, `@latest`, paket tak dipin, figma/github/gateway enabled, atau Code Mode dimatikan.
Code Mode (default v2) tetap aktif: tool diakses `tools.<server>.<tool>`; deny per tool tetap berlaku.
