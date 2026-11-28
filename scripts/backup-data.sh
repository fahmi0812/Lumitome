#!/usr/bin/env bash
# Helper backup/restore data engine OpenCode (LUMI_XDG_DATA) sebelum/sesudah upgrade.
# Non-destruktif (tanpa penghapusan paksa): hentikan service dulu, salin ke data.pre-<ver>.bak, restore via mv.
# Pakai: bash scripts/backup-data.sh [backup|restore]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LH="${LUMI_HOME:-${SW_HOME:-$HOME/.lumitome}}" # env-compat-allow
DATA="${LUMI_XDG_DATA:-$LH/data}"
VER="$(ROOT="$ROOT" node --no-warnings -e 'import(process.env.ROOT+"/lumitome/lib/engine.mjs").then(m=>process.stdout.write(m.ENGINE_MIN_2_4))')"
BAK="${DATA}.pre-${VER}.bak"
CMD="${1:-backup}"

stop_service() {
  node --no-warnings "$ROOT/lumitome/bin/lumitome.mjs" service stop >/dev/null 2>&1 || true
}

case "$CMD" in
  backup)
    stop_service
    if [ ! -e "$DATA" ]; then
      echo "backup-data: direktori data belum ada ($DATA) — dilewati"
      exit 0
    fi
    TARGET="$BAK"
    if [ -e "$TARGET" ]; then
      TARGET="${BAK}.$(date +%Y%m%d%H%M%S)"
    fi
    cp -a "$DATA" "$TARGET"
    echo "backup-data: tersimpan ke $TARGET"
    ;;
  restore)
    stop_service
    if [ ! -e "$BAK" ]; then
      echo "backup-data: backup tidak ditemukan ($BAK)" >&2
      exit 1
    fi
    if [ -e "$DATA" ]; then
      POST="${DATA}.post-${VER}.bak.$(date +%Y%m%d%H%M%S)"
      mv "$DATA" "$POST"
      echo "backup-data: data aktif dipindah ke $POST"
    fi
    mv "$BAK" "$DATA"
    echo "backup-data: dipulihkan dari $BAK → $DATA"
    ;;
  *)
    echo "pakai: bash scripts/backup-data.sh [backup|restore]" >&2
    exit 2
    ;;
esac
