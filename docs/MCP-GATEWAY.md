# Gateway MCP opsional (default MATI)

ZIP berjalan **tanpa Docker**: semua `gw-*` di `opencode.jsonc` `disabled: true`.
Bila ingin satu titik auth/audit/isolasi (rekomendasi riset MCP-REPORT §3): jalankan salah satu gateway dan ekspos **satu endpoint per sektor**:

| Sektor | Server OpenCode | URL | Token env |
|---|---|---|---|
| coding | gw-coding | http://127.0.0.1:8811/mcp | SW_MCP_TOKEN_CODING |
| media | gw-media | http://127.0.0.1:8812/mcp | SW_MCP_TOKEN_MEDIA |
| riset | gw-riset | http://127.0.0.1:8813/mcp | SW_MCP_TOKEN_RISET |
| penulisan | gw-penulisan | http://127.0.0.1:8814/mcp | SW_MCP_TOKEN_PENULISAN |
| security | gw-security | http://127.0.0.1:8815/mcp | SW_MCP_TOKEN_SECURITY |
| finance | gw-finance | http://127.0.0.1:8816/mcp | SW_MCP_TOKEN_FINANCE |

- **Docker MCP Gateway** (https://github.com/docker/mcp-gateway): `config/mcp-gateway/docker-mcp-gateway.sh` — profil `sw-<sektor>`, allowlist tool `docker mcp profile tools`, `docker mcp gateway run --profile … --transport streaming --port …`.
- **IBM ContextForge** (https://github.com/IBM/mcp-context-forge): `config/mcp-gateway/contextforge-virtual-servers.json` — satu virtual server per sektor (`associated_tools`). Ganti URL `gw-*` ke endpoint virtual server ContextForge Anda.

Aktifkan: ubah `"disabled": true` → `false` hanya untuk `gw-<sektor>` yang jalan, isi token di `~/.swanwright/secrets.env`, lalu `bash install.sh --doctor`.
Permission sektor sudah meng-allow `gw-<sektor>_*` saja (gen-policy), jadi sektor lain tak bisa memakai endpoint itu.
[VERIFIKASI] path `/mcp` & mekanisme token bergantung versi gateway — cek `--help`/docs sebelum produksi. Belum diuji di box (tanpa Docker).
