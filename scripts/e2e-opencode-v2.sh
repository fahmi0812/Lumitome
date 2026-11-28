#!/usr/bin/env bash
# E2E OpenCode v2 = doctor (v0.1.6). Meneruskan LUMI_ENGINE_BIN & LUMI_ENGINE_VERSION. Pakai: bash scripts/e2e-opencode-v2.sh [dir]
[ -n "${LUMI_ENGINE_BIN:-}" ] && export LUMI_ENGINE_BIN
[ -n "${LUMI_ENGINE_VERSION:-}" ] && export LUMI_ENGINE_VERSION
exec bash "$(dirname "$0")/doctor.sh" "$@"
