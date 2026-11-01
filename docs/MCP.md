# MCP Swanwright v0.1.6 — per sektor, deny-by-default

Sumber pemetaan: `router/mcp-sectors.json` → `scripts/gen-policy.mjs` → frontmatter `permissions` agent.
Aturan OpenCode v2 (https://opencode.ai/v2/docs/permissions/ , /v2/docs/mcp-servers/): aksi MCP = nama tool ternormalisasi `<server>_<tool>`, aturan **terakhir yang cocok menang**, agent rules ditambahkan setelah global.

Pola tiap agent: `{"action":"*_*","effect":"deny"}` → `external_directory: ask` (dipulihkan karena ikut tertangkap `*_*`) → `allow <server>_*` untuk server sektor itu → `ask` untuk tool tulis/destruktif.

| Server | Jenis | Default | Pin | Sektor | Catatan |
|---|---|---|---|---|---|
| context7 | local npx | ON | `@upstash/context7-mcp@4.4.4` | coding, riset, penulisan, security, elephant | docs library |
| codemem | local biner | ON | codebase-memory-mcp **v0.12.1** (SHA256 + checksums.txt) | coding, security, elephant, goldfish | didaftarkan manual; `install`/`update` diblok (permissions + plugin); `delete_project`, `manage_adr` = **ask** |
| playwright | local npx | ON | `@playwright/mcp@0.0.83 --headless --isolated` | coding, media, riset | browser: `bash install.sh --with-browsers` |
| chromedev | local npx | ON | `chrome-devtools-mcp@1.12.0 --headless --isolated --usageStatistics=false` | coding, media | butuh Google Chrome stable terpasang |
| markitdown | local uvx | ON | `markitdown-mcp==0.0.1a8` | riset, penulisan, finance | konversi dokumen → Markdown |
| figma | remote | **OFF** | `https://mcp.figma.com/mcp` (resmi) | media | OAuth: set `disabled:false`, lalu `opencode mcp auth figma`; butuh seat Dev/Full |
| github | remote | **OFF** | `https://api.githubcopilot.com/mcp/` | coding (devops) | `Authorization: Bearer {env:GITHUB_PERSONAL_ACCESS_TOKEN}`; tool tulis = ask |
| skills-&lt;sektor&gt; (6) | local node | ON | `router/skill-search-mcp.mjs` | sektornya saja | `skill_search` read-only, allowlist sektor |
| gw-&lt;sektor&gt; (6) | remote | **OFF** | `http://127.0.0.1:8811..8816/mcp` | sektornya saja | gateway opsional, lihat `docs/MCP-GATEWAY.md` |

Tidak dipasang: Kali/offensive MCP, MCP trading (alpaca/ccxt/freqtrade) — `checkMcpPolicy` menolak.
Rahasia: hanya `{env:NAME}` di config; nilai di `~/.swanwright/secrets.env` (chmod 600, di luar repo). `npm run validate` gagal bila ada token literal, `@latest`, paket tak dipin, figma/github/gateway enabled, atau Code Mode dimatikan.
Code Mode (default v2) tetap aktif: tool diakses `tools.<server>.<tool>`; deny per tool tetap berlaku.
