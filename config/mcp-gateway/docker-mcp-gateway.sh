#!/usr/bin/env bash
# TEMPLATE (opsional, default MATI). Docker MCP Gateway: satu profil + satu port per sektor, bind 127.0.0.1.
# Sumber: https://github.com/docker/mcp-gateway (README: profile create, profile tools, gateway run --transport streaming).
# Setelah jalan: set disabled:false pada mcp.servers.gw-<sektor> di opencode.jsonc, dan export SW_MCP_TOKEN_<SEKTOR>.
# [VERIFIKASI] flag auth/bind & path endpoint (/mcp) di versi Docker Desktop/CLI Anda: docker mcp gateway run --help
set -euo pipefail
command -v docker >/dev/null || { echo "Docker tidak ada — gateway opsional, lewati."; exit 0; }
docker mcp feature enable profiles 2>/dev/null || true
docker mcp catalog pull mcp/docker-mcp-catalog
# Profil per sektor (server katalog Docker; tanpa Kali, tanpa trading)
docker mcp profile create --name sw-coding    --server catalog://mcp/docker-mcp-catalog/github --server catalog://mcp/docker-mcp-catalog/context7 || true
docker mcp profile create --name sw-riset     --server catalog://mcp/docker-mcp-catalog/context7 || true
docker mcp profile create --name sw-penulisan --server catalog://mcp/docker-mcp-catalog/markitdown || true
# Allowlist tool (contoh: github read-only)
docker mcp profile tools sw-coding --disable-all github
docker mcp profile tools sw-coding --enable github.get_file_contents --enable github.list_pull_requests --enable github.search_code
# Jalankan (satu terminal per sektor). Port = mcp-sectors.json gateway.basePort + urutan sektor.
echo "docker mcp gateway run --profile sw-coding    --transport streaming --port 8811"
echo "docker mcp gateway run --profile sw-riset     --transport streaming --port 8813"
echo "docker mcp gateway run --profile sw-penulisan --transport streaming --port 8814"
