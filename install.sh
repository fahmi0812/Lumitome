#!/usr/bin/env bash
# Lumitome — installer (Linux / macOS / Windows via WSL2). Idempoten. Terisolasi dari OpenCode milik user:
#   engine OpenCode v2.2.4 terpin (SHA256) di $LUMI_HOME/bin (default ~/.lumitome) — TIDAK ditaruh di PATH global,
#   tidak menyentuh ~/.config/opencode, ~/.local/share/opencode (auth.json, sesi) atau `opencode` global.
#   Satu-satunya file di luar $LUMI_HOME: launcher $LUMI_BIN_DIR/lumitome (default ~/.local/bin).
# Pakai:  curl -fsSL https://raw.githubusercontent.com/fahmi0812/Lumitome/main/install.sh | bash
#   atau: bash install.sh [--doctor] [--dry-run] [--uninstall] [--no-node] [--no-cbm] [--no-uv] [--skip-npm] [--with-browsers] [--project DIR]
set -euo pipefail

OC_VERSION=2.2.4
CBM_VERSION=0.12.1
UV_VERSION=0.13.6
NODE_VERSION=22.23.4
LUMI_HOME="${LUMI_HOME:-$HOME/.lumitome}"; SW_HOME="$LUMI_HOME"   # SW_HOME warisan (mis. instalasi Swanwright) sengaja diabaikan
if [ -d "$SW_HOME" ] && [ -n "$(ls -A "$SW_HOME" 2>/dev/null)" ] && [ ! -f "$SW_HOME/.lumitome-home" ] && [ "${LUMI_FORCE_HOME:-0}" != 1 ]; then
  echo "[lumitome] $SW_HOME berisi file yang bukan milik lumitome — pilih LUMI_HOME lain (atau LUMI_FORCE_HOME=1)" >&2; exit 1; fi
case " $* " in *" --uninstall "*|*" --dry-run "*|*" --doctor "*) ;; *) mkdir -p "$SW_HOME" && touch "$SW_HOME/.lumitome-home";; esac
LUMI_BIN_DIR="${LUMI_BIN_DIR:-$HOME/.local/bin}"
BIN="$SW_HOME/bin"
# ---------- log tenang: detail teknis ke $SW_HOME/logs/install.log (bukan ke layar) ----------
# Ditentukan sedini mungkin: bila $SW_HOME/logs bisa ditulis pakai itu; bila belum (mis. --dry-run,
# --doctor, --uninstall) log dulu ke TMP lalu dipindahkan ke $SW_HOME/logs/install.log di akhir
# install sukses; saat gagal, die() menyelamatkan log TMP itu ke $SW_HOME/logs bila bisa.
LOG_FILE=""; LOG_PENDING=0
case " $* " in *" --uninstall "*|*" --dry-run "*|*" --doctor "*) LOG_PENDING=1;; *)
  if mkdir -p "$SW_HOME/logs" 2>/dev/null; then LOG_FILE="$SW_HOME/logs/install.log"; else LOG_PENDING=1; fi;; esac
if [ "$LOG_PENDING" = 1 ]; then
  _ld="$(mktemp -d "${TMPDIR:-/tmp}/lumi-install-log.XXXXXX" 2>/dev/null || true)"
  if [ -n "$_ld" ]; then LOG_FILE="$_ld/install.log"; else LOG_FILE="${TMPDIR:-/tmp}/lumitome-install.log"; fi
fi
log() { [ -n "${LOG_FILE:-}" ] || return 0; printf '%s\n' "$*" >>"$LOG_FILE" 2>/dev/null || true; }
note() { log "$*"; }   # detail teknis: hanya ke log, bukan ke layar
log "=== install.sh mulai $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "") ==="
# ---------- tampilan tenang (bahasa visual sama seperti `lumitome update`) ----------
# TTY: logo emas + SATU baris status spinner (stderr) + SATU baris hasil. Non-TTY / CI / TERM=dumb /
# --dry-run / --doctor: baris polos tanpa animasi & tanpa ANSI. Frame braille bila UTF-8, ASCII bila bukan.
# Bash murni (Node belum tentu ada saat install). Emas sama seperti update-ui: kiri #C9962E, kanan #F3D27A.
UI_TTY=0; UI_COLOR=0; UI_ASCII=1
case " $* " in *" --dry-run "*|*" --doctor "*) ;; *)
  if [ -t 2 ] && [ "${TERM:-}" != "dumb" ] && [ -z "${CI:-}" ]; then UI_TTY=1; fi;; esac
[ "$UI_TTY" = 1 ] && [ -z "${NO_COLOR:-}" ] && UI_COLOR=1
if [ "${LUMI_ASCII:-}" = "1" ]; then UI_ASCII=1
elif [ "${LUMI_ASCII:-}" = "0" ]; then UI_ASCII=0
else
  _cm="$(locale charmap 2>/dev/null || true)"
  case "$_cm" in UTF-8) UI_ASCII=0;; *) case "${LANG:-}${LC_ALL:-}${LC_CTYPE:-}" in *UTF-8*|*utf8*) UI_ASCII=0;; *) UI_ASCII=1;; esac;; esac
fi
if [ "$UI_ASCII" = 1 ]; then UI_FRAMES=('|' '/' '-' '\'); UI_ELL="..."; UI_OK="OK"; UI_BAD="x"
else UI_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏'); UI_ELL="…"; UI_OK="✓"; UI_BAD="✗"; fi
SPIN_PID=""; SPIN_LIVE=0
_gold() { # _gold R G B teks — emas bila warna aktif, polos bila bukan
  if [ "$UI_COLOR" = 1 ]; then printf '\033[38;2;%s;%s;%sm%s\033[0m' "$1" "$2" "$3" "$4"
  else printf '%s' "$4"; fi
}
_spin_loop() { # $1 = label; jalan di background, tulis ke stderr
  local i=0 f
  while true; do
    f="${UI_FRAMES[$((i % ${#UI_FRAMES[@]}))]}"
    if [ "$UI_COLOR" = 1 ]; then printf '\r\033[2K\033[38;2;243;210;122m%s\033[0m %s%s' "$f" "$1" "$UI_ELL" >&2
    else printf '\r\033[2K%s %s%s' "$f" "$1" "$UI_ELL" >&2; fi
    i=$((i + 1)); sleep 0.08 2>/dev/null || sleep 1
  done
}
_spin_stop() { # bunuh loop background, pulihkan kursor, bersihkan baris (idempoten)
  if [ -n "$SPIN_PID" ]; then kill "$SPIN_PID" 2>/dev/null || true; wait "$SPIN_PID" 2>/dev/null || true; SPIN_PID=""; fi
  if [ "$SPIN_LIVE" = 1 ]; then printf '\r\033[2K' >&2; printf '\033[?25h' >&2; SPIN_LIVE=0; fi
}
trap '_spin_stop; exit 130' INT TERM
ui_logo() { # logo emas "L U M I T O M E" (seperti fallback ASCII update-ui); TTY saja
  [ "$UI_TTY" = 1 ] || return 0
  printf '\n  ' >&2; _gold 201 150 46 "L U M I " >&2; _gold 243 210 122 "T O M E" >&2; printf '\n\n' >&2
}
ui_step() { # $1 = label manusiawi; TTY: spinner di baris yang sama; non-TTY: satu baris polos
  if [ "$UI_TTY" = 0 ]; then printf '%s%s\n' "$1" "$UI_ELL" >&2; return 0; fi
  _spin_stop
  if [ "$SPIN_LIVE" = 0 ]; then printf '\033[?25l' >&2; SPIN_LIVE=1; fi
  _spin_loop "$1" & SPIN_PID=$!
}
ui_done() { # $1 = baris hasil
  _spin_stop
  if [ "$UI_TTY" = 1 ]; then
    if [ "$UI_COLOR" = 1 ]; then printf '  \033[38;2;243;210;122m%s\033[0m %s\n' "$UI_OK" "$1" >&2
    else printf '  %s %s\n' "$UI_OK" "$1" >&2; fi
  else printf '%s\n' "$1" >&2; fi
}
die() { # die <pesan> [hint] — matikan spinner dulu, lalu FAIL + hint + path log (+ ekor log)
  _spin_stop
  log "FAIL: $1"
  if [ "${DRY:-0}" != 1 ] && [ "$LOG_PENDING" = 1 ] && [ -f "${LOG_FILE:-}" ] \
    && mkdir -p "$SW_HOME/logs" 2>/dev/null && mv "$LOG_FILE" "$SW_HOME/logs/install.log" 2>/dev/null; then
    LOG_FILE="$SW_HOME/logs/install.log"; LOG_PENDING=0
  fi
  if [ "$UI_TTY" = 1 ]; then
    if [ "$UI_COLOR" = 1 ]; then printf '  \033[31mFAIL\033[0m %s\n' "$1" >&2
    else printf '  FAIL %s\n' "$1" >&2; fi
  else printf 'FAIL %s\n' "$1" >&2; fi
  if [ -n "${2:-}" ]; then
    if [ "$UI_COLOR" = 1 ]; then printf '    \033[2m%s\033[0m\n' "$2" >&2
    elif [ "$UI_TTY" = 1 ]; then printf '    %s\n' "$2" >&2
    else printf '%s\n' "$2" >&2; fi
  fi
  if [ -n "${LOG_FILE:-}" ]; then
    printf 'Log: %s\n' "$LOG_FILE" >&2
    if [ -f "$LOG_FILE" ]; then tail -n 5 "$LOG_FILE" 2>/dev/null | sed 's/^/  /' >&2 || true; fi
  fi
  exit 1
}
# ---------- bootstrap jarak jauh: `curl -fsSL .../install.sh | bash` ----------
SW_REPO_URL="${LUMI_REPO_URL:-https://github.com/fahmi0812/Lumitome.git}"
_src="${BASH_SOURCE[0]:-}"
if [ -n "$_src" ] && [ -f "$_src" ]; then PROJECT="$(cd "$(dirname "$_src")" && pwd)"; else PROJECT=""; fi
case " $* " in *" --uninstall "*) _UN=1;; *) _UN=0;; esac
if [ "$_UN" = 0 ] && { [ -z "$PROJECT" ] || [ ! -f "$PROJECT/opencode.jsonc" ] || [ ! -f "$PROJECT/scripts/doctor.sh" ]; }; then
  SW_SRC="${SW_SRC:-$SW_HOME/src}"
  command -v git >/dev/null 2>&1 || die "butuh 'git' untuk mode remote" "Pasang git lewat package manager: apt/brew install git"
  log "mode remote: menyiapkan sumber di $SW_SRC"
  case " $* " in *" -h "*|*" --help "*) ;; *) ui_step "Menyiapkan sumber";; esac
  if [ -d "$SW_SRC/.git" ]; then git -C "$SW_SRC" pull --ff-only origin main >>"$LOG_FILE" 2>&1 || true
  else mkdir -p "$(dirname "$SW_SRC")"; git clone --depth 1 "$SW_REPO_URL" "$SW_SRC" >>"$LOG_FILE" 2>&1 || die "unduh sumber gagal" "Cek koneksi internet, lalu coba lagi."; fi
  _spin_stop
  exec bash "$SW_SRC/install.sh" "$@"
fi
UNINSTALL=0 DRY=0 DO_NODE=1 DO_CBM=1 DO_UV=1 DO_NPM=1 DOCTOR=0 BROWSERS=0

while [ $# -gt 0 ]; do case "$1" in
  --doctor) DOCTOR=1;; --uninstall) UNINSTALL=1;; --dry-run) DRY=1;; --no-node) DO_NODE=0;; --no-cbm) DO_CBM=0;; --no-uv) DO_UV=0;;
  --skip-npm) DO_NPM=0;; --with-browsers) BROWSERS=1;; --project) PROJECT="$(cd "$2" && pwd)"; shift;;
  -h|--help) sed -n 2,5p "$0"; exit 0;; *) echo "opsi tidak dikenal: $1" >&2; exit 2;; esac; shift; done

say() { if [ "$UI_COLOR" = 1 ]; then printf '\033[1;34m[lumitome]\033[0m %s\n' "$*" >&2; else printf '[lumitome] %s\n' "$*" >&2; fi; }
ok()  { if [ "$UI_COLOR" = 1 ]; then printf '  \033[32mOK\033[0m   %s\n' "$*" >&2; else printf '  OK   %s\n' "$*" >&2; fi; }
warn(){ if [ "$UI_COLOR" = 1 ]; then printf '  \033[33mWARN\033[0m %s\n' "$*" >&2; else printf '  WARN %s\n' "$*" >&2; fi; }
# die() sudah didefinisikan di atas (matikan spinner dulu, lalu FAIL + hint + path log).
run() { if [ "$DRY" = 1 ]; then echo "  (dry-run) $*"; else log "\$ $*"; "$@" >>"$LOG_FILE" 2>&1 || die "perintah gagal: $*"; fi; }

# ---------- deteksi OS/arch ----------
OS="$(uname -s)"; ARCH="$(uname -m)"; FLAVOR=""
case "$OS" in
  Linux)  OS=linux; grep -qi microsoft /proc/version 2>/dev/null && FLAVOR=" (WSL)";;
  Darwin) OS=darwin;;
  MINGW*|MSYS*|CYGWIN*) die "Windows native tidak didukung. Pasang WSL2 (wsl --install -d Ubuntu), lalu jalankan skrip ini DI DALAM WSL.";;
  *) die "OS tidak didukung: $OS";;
esac
case "$ARCH" in x86_64|amd64) ARCH=x64;; aarch64|arm64) ARCH=arm64;; *) die "arsitektur tidak didukung: $ARCH";; esac
# ---------- uninstall: hanya $LUMI_HOME (bermarker) + launcher bermarker; OpenCode user tidak disentuh ----------
if [ "$UNINSTALL" = 1 ]; then
  ui_logo
  ui_step "Menghapus Lumitome"
  L="$LUMI_BIN_DIR/lumitome"; _removed=""; _left=""
  if [ -f "$L" ] && grep -q "LUMITOME-LAUNCHER" "$L"; then rm -f "$L"; _removed="launcher"
  else _left="launcher bukan milik Lumitome, dibiarkan"; fi
  if [ -f "$SW_HOME/.lumitome-home" ]; then rm -rf "$SW_HOME"; _removed="${_removed:+$_removed + }$SW_HOME"
  else _left="${_left:+$_left; }$SW_HOME tanpa marker .lumitome-home, tidak dihapus"; fi
  if [ -n "$_removed" ]; then _msg="Selesai — Lumitome dihapus ($_removed)"; else _msg="Selesai — tidak ada yang dihapus"; fi
  [ -n "$_left" ] && _msg="$_msg; $_left"
  ui_done "$_msg"
  exit 0
fi
SW_VERSION="$(cat "$PROJECT/VERSION" 2>/dev/null || echo "?")" # single-source: jangan hardcode (bump via scripts/bump-version.mjs)
note "Lumitome $SW_VERSION · $OS-$ARCH$FLAVOR · SW_HOME=$SW_HOME · proyek=$PROJECT"

if [ "$DOCTOR" = 1 ]; then exec bash "$PROJECT/scripts/doctor.sh" "$PROJECT"; fi
ui_logo

need() { command -v "$1" >/dev/null 2>&1 || die "butuh '$1'" "Pasang lewat package manager: apt/brew install $1"; }
need curl; need tar
if [ "$OS" = darwin ]; then need unzip; fi
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
TMP="$(mktemp -d)"; trap '_spin_stop; rm -rf "$TMP"' EXIT
# fetch URL PINNED_SHA [SUMS_URL]  → verifikasi ganda: hash terpin di skrip + file checksum rilis
fetch() {
  local url="$1" pin="$2" sums="${3:-}" f="$TMP/$(basename "$1")"
  [ "$DRY" = 1 ] && { echo "  (dry-run) unduh $url"; return 0; }
  log "\$ curl -fsSL $url"
  curl -fsSL --retry 3 -o "$f" "$url" >>"$LOG_FILE" 2>&1 || die "unduh gagal: $url" "Cek koneksi internet, lalu coba lagi."
  local got; got="$(sha256 "$f")"
  [ "$got" = "$pin" ] || die "SHA256 tidak cocok untuk $(basename "$url"): $got != $pin" "File unduhan tidak sesuai dengan rilis; coba lagi."
  if [ -n "$sums" ]; then
    curl -fsSL --retry 3 -o "$TMP/sums" "$sums" >>"$LOG_FILE" 2>&1 || die "unduh checksum gagal: $sums" "Cek koneksi internet, lalu coba lagi."
    grep -E "^$got[[:space:]]+\*?$(basename "$url")\$" "$TMP/sums" >/dev/null || die "$(basename "$url") tidak ada/cocok di $(basename "$sums")" "File checksum rilis tidak memuat hash ini; coba lagi."
  fi
  note "SHA256 terverifikasi $(basename "$url")"
}
mkdir -p "$BIN"; [ "$DRY" = 1 ] || touch "$SW_HOME/.lumitome-home"

# ---------- OpenCode v2.2.4 ----------
# default: build Lumitome (OpenCode v2.2.4, hanya logo diganti; engine/patches/logo.patch). LUMI_ENGINE=upstream → binary resmi.
LUMI_ENGINE_TAG=engine-2.2.4-lumi.1
oc_asset() { case "$OS-$ARCH" in
  linux-x64) echo "opencode-linux-x64.tar.gz 1b70ce4a88e27c3643c2bb61c757dfe173b4e3629926ce808d45f3774d87826e";;
  linux-arm64) echo "opencode-linux-arm64.tar.gz 81edcae078f36356cde3cf57d0cc6627896b18d1bddf47317cb025c56fcffd93";;
  darwin-x64) echo "opencode-darwin-x64.zip 2be9b7671f94a9636b85ff31fcfce613f197c5204ec90291982d692010d072fd";;
  darwin-arm64) echo "opencode-darwin-arm64.zip 4e093cae2931773c354896d98e7da0cfa3607c110aeaf255ba07f9c2d2238219";; esac; }
lumi_asset() { case "$OS-$ARCH" in
  linux-x64) echo "opencode-linux-x64.tar.gz be6d3d72ee5de8e8db2fa3409ecf690b41590b5b639838e81ad6d5f9e4c2d0cb";;
  linux-arm64) echo "opencode-linux-arm64.tar.gz 47a0a48a23a37d5976aa4ca354ed83a1bc9c8d633991e4075f1d4124598508e6";;
  darwin-x64) echo "opencode-darwin-x64.zip 14c6d9a29be862112417fec61e3413105e619783af4c44c3c55c6d38df1e7482";;
  darwin-arm64) echo "opencode-darwin-arm64.zip ce0b62ac9baad5bd7146c53892d879832bd3fcc9e0e579b81ba5e0d76b0e5284";; esac; }
if [ "${LUMI_ENGINE:-}" = upstream ] || [ -z "$(lumi_asset)" ]; then
  OC_FLAVOR=upstream; OC_BASE="https://github.com/anomalyco/opencode/releases/download/v$OC_VERSION"; OC_PICK="$(oc_asset)"
else
  OC_FLAVOR=$LUMI_ENGINE_TAG; OC_BASE="https://github.com/fahmi0812/Lumitome/releases/download/$LUMI_ENGINE_TAG"; OC_PICK="$(lumi_asset)"
fi
ui_step "Menyiapkan mesin"
note "OpenCode v$OC_VERSION ($OC_FLAVOR)"
# engine dijalankan dengan XDG terisolasi → tidak menulis log/state ke ~/.local/share/opencode milik user
oc_engine() { XDG_DATA_HOME="$SW_HOME/xdg/data" XDG_CONFIG_HOME="$SW_HOME/xdg/config" XDG_STATE_HOME="$SW_HOME/xdg/state" XDG_CACHE_HOME="$SW_HOME/xdg/cache" \
  OPENCODE_DISABLE_AUTOUPDATE=1 OPENCODE_DISABLE_MODELS_FETCH=1 "$BIN/opencode" "$@"; }
oc_have_flavor() { cat "$BIN/opencode.flavor" 2>/dev/null || echo upstream; }
if [ -x "$BIN/opencode" ] && oc_engine --version 2>/dev/null | grep -q "v$OC_VERSION" && [ "$(oc_have_flavor)" = "$OC_FLAVOR" ]; then note "sudah terpasang ($BIN/opencode, $OC_FLAVOR)"
else
  set -- $OC_PICK
  fetch "$OC_BASE/$1" "$2" "$OC_BASE/SHA256SUMS"
  if [ "$DRY" = 0 ]; then
    rm -rf "$TMP/oc"
    case "$1" in *.zip) unzip -qo "$TMP/$1" -d "$TMP/oc";; *) mkdir -p "$TMP/oc" && tar -xzf "$TMP/$1" -C "$TMP/oc";; esac
    rm -f "$BIN/opencode"; install -m 0755 "$(find "$TMP/oc" -type f -name opencode | head -1)" "$BIN/opencode"
    echo "$OC_FLAVOR" > "$BIN/opencode.flavor"
    oc_engine --version 2>>"$LOG_FILE" | grep -q "v$OC_VERSION" || die "versi opencode tidak sesuai"
    note "$(oc_engine --version 2>>"$LOG_FILE") ($OC_FLAVOR)"
  fi
fi
command -v opencode >/dev/null 2>&1 && note "opencode global user dibiarkan apa adanya ($(command -v opencode); tidak dijalankan); engine lumitome terpisah di $BIN"

# ---------- Node >= 22.6 (node:sqlite + FTS5, --experimental-strip-types) ----------
ui_step "Menyiapkan Node"
note "Node.js (>= 22.6)"
NODE_DIR="$SW_HOME/node-v$NODE_VERSION-$OS-$ARCH"
node_ok() { "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=6)?0:1)' 2>/dev/null; }
if [ -x "$NODE_DIR/bin/node" ]; then NODE="$NODE_DIR/bin/node"; note "node lokal $("$NODE" -v)"
elif command -v node >/dev/null && node_ok node; then NODE="$(command -v node)"; NODE_DIR=""; note "node sistem $(node -v)"
elif [ "$DO_NODE" = 1 ]; then
  case "$OS-$ARCH" in
    linux-x64) NSHA=b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406;; linux-arm64) NSHA=f7a1e486dbc8b286847815b477d4fb5e9fb963ed4489c3e1588853d685f589f9;;
    darwin-x64) NSHA=efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819;; darwin-arm64) NSHA=c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428;; esac
  nb="https://nodejs.org/dist/v$NODE_VERSION"; nf="node-v$NODE_VERSION-$OS-$ARCH.tar.gz"
  fetch "$nb/$nf" "$NSHA" "$nb/SHASUMS256.txt"
  run tar -xzf "$TMP/$nf" -C "$SW_HOME"; NODE="$NODE_DIR/bin/node"; [ "$DRY" = 1 ] || note "node $("$NODE" -v) → $NODE_DIR"
else die "node >= 22.6 tidak ada (hapus --no-node agar dipasang otomatis)"; fi
if [ "$DRY" = 0 ]; then
  "$NODE" --no-warnings -e 'const{DatabaseSync}=require("node:sqlite");new DatabaseSync(":memory:").exec("create virtual table t using fts5(a)")' >>"$LOG_FILE" 2>&1 \
    && note "SQLite bawaan node: FTS5 tersedia" || die "node:sqlite/FTS5 tidak tersedia"
  command -v sqlite3 >/dev/null && note "sqlite3 CLI $(sqlite3 --version | cut -d' ' -f1) (opsional)" || note "sqlite3 CLI tidak ada (opsional; untuk inspeksi runtime/skills.db: apt install sqlite3 / brew install sqlite)"
fi

# ---------- codebase-memory-mcp (JANGAN jalankan 'install') ----------
ui_step "Menyiapkan codebase-memory"
note "codebase-memory-mcp v$CBM_VERSION"
if [ "$DO_CBM" = 0 ]; then note "dilewati (--no-cbm): server codemem akan gagal connect"
elif "$BIN/codebase-memory-mcp" --version 2>/dev/null | grep -q "$CBM_VERSION"; then note "sudah terpasang"
else
  ca=$([ "$ARCH" = x64 ] && echo amd64 || echo arm64)
  cf="codebase-memory-mcp-$OS-$ca${SW_CBM_PORTABLE:+-portable}.tar.gz"
  case "$cf" in
    codebase-memory-mcp-linux-amd64.tar.gz) cs=8453015145f072c1b9b019cbdd02cea8cc6f18cc5e116036dd20992631c638c7;;
    codebase-memory-mcp-linux-amd64-portable.tar.gz) cs=8c3d0341064301e78ecc84cf7348d4e2c6562a0f57448243ea560aaa34de36c1;;
    codebase-memory-mcp-linux-arm64.tar.gz) cs=8575f126092660b93b170bdc2e06f3ef2dd28d3cc49ad6d0895dc3e4767219cd;;
    codebase-memory-mcp-linux-arm64-portable.tar.gz) cs=ed0f1f548cd79b121c401c2e9f7841c189a001af26d3768368088c24f6a53533;;
    codebase-memory-mcp-darwin-amd64.tar.gz) cs=ca6e64397a8ae80cec898a8205a6aa16750ac798acc05a0c3ed983837944a581;;
    codebase-memory-mcp-darwin-arm64.tar.gz) cs=9bfcbe38414b47969a3e1d1c1999f5357409387c86fa3d24221b5458267660d2;;
    *) die "aset cbm tidak dikenal: $cf";; esac
  cb="https://github.com/DeusData/codebase-memory-mcp/releases/download/v$CBM_VERSION"
  fetch "$cb/$cf" "$cs" "$cb/checksums.txt"
  if [ "$DRY" = 0 ]; then
    mkdir -p "$TMP/cbm" && tar -xzf "$TMP/$cf" -C "$TMP/cbm"
    install -m 0755 "$(find "$TMP/cbm" -type f -name codebase-memory-mcp | head -1)" "$BIN/codebase-memory-mcp"
    note "$("$BIN/codebase-memory-mcp" --version 2>>"$LOG_FILE") (didaftarkan manual sebagai 'codemem'; 'install' tidak dijalankan)"
  fi
fi

# ---------- uv / uvx (markitdown-mcp) ----------
ui_step "Menyiapkan uv"
note "uv/uvx (markitdown-mcp)"
if [ "$DO_UV" = 0 ]; then note "dilewati (--no-uv): server markitdown akan gagal connect"
elif command -v uvx >/dev/null 2>&1 || [ -x "$BIN/uvx" ]; then note "uvx ada ($(command -v uvx || echo "$BIN/uvx"))"
else
  case "$OS-$ARCH" in
    linux-x64) ut=x86_64-unknown-linux-gnu; us=f29c3e94ffabd7e6f3ba521dba169a9b7ec12100bf3257087f0f24f6123f3645;;
    linux-arm64) ut=aarch64-unknown-linux-gnu; us=229e194255c7958d86d56e8790d969a6f74736592133f0dfd0076f754c642c1d;;
    darwin-x64) ut=x86_64-apple-darwin; us=63ba17fdda55ad1a230d4b37fc6017ffa10c23688c83818bd3bfdf914c652a02;;
    darwin-arm64) ut=aarch64-apple-darwin; us=60fbd5c8a1ed681845eea28d9d622fcde03c51e91a43465b64a1e17db1ed3472;; esac
  ub="https://github.com/astral-sh/uv/releases/download/$UV_VERSION"
  fetch "$ub/uv-$ut.tar.gz" "$us" "$ub/uv-$ut.tar.gz.sha256"
  if [ "$DRY" = 0 ]; then tar -xzf "$TMP/uv-$ut.tar.gz" -C "$TMP"; install -m 0755 "$TMP/uv-$ut/uv" "$TMP/uv-$ut/uvx" "$BIN/"; note "$("$BIN/uv" --version 2>>"$LOG_FILE")"; fi
fi

# ---------- env.sh (PATH + default 9router; token opsional di secrets.env, chmod 600, DI LUAR repo) ----------
ui_step "Menyiapkan env"
note "$SW_HOME/env.sh"
if [ "$DRY" = 0 ]; then
  cat > "$SW_HOME/env.sh" <<ENV
# Dibangkitkan install.sh Lumitome $SW_VERSION — HANYA di-source oleh launcher lumitome (bukan shell user).
export SW_HOME="$SW_HOME" LUMI_HOME="$SW_HOME" LUMI_OPENCODE="$BIN/opencode"
case ":\$PATH:" in *":$BIN:"*) ;; *) export PATH="$BIN:\$PATH";; esac
${NODE_DIR:+case ":\$PATH:" in *":$NODE_DIR/bin:"*) ;; *) export PATH="$NODE_DIR/bin:\$PATH";; esac}
export SW_9ROUTER_URL="\${SW_9ROUTER_URL:-http://127.0.0.1:20128/v1}"
export SW_9ROUTER_KEY="\${SW_9ROUTER_KEY:-9router}"
# Token opsional (GITHUB_PERSONAL_ACCESS_TOKEN, SW_MCP_TOKEN_<SEKTOR>, CONTEXT7_API_KEY) → \$SW_HOME/secrets.env
[ -f "\$SW_HOME/secrets.env" ] && set -a && . "\$SW_HOME/secrets.env" && set +a
true
ENV
  [ -f "$SW_HOME/secrets.env" ] || { umask 077; printf '# export GITHUB_PERSONAL_ACCESS_TOKEN=...\n# SW_MCP_TOKEN_CODING=...\n' > "$SW_HOME/secrets.env"; }
  chmod 600 "$SW_HOME/secrets.env"
  note "tulis env.sh; secrets.env (600) tidak pernah masuk repo"
fi
# shellcheck disable=SC1091
[ "$DRY" = 1 ] || . "$SW_HOME/env.sh"

# ---------- proyek: npm ci, indeks skill, policy, precache ----------
ui_step "Menyiapkan proyek"
note "proyek $PROJECT"
cd "$PROJECT"
if [ "$DO_NPM" = 1 ]; then run npm ci --no-audit --no-fund --loglevel=error; note "npm ci selesai"; fi
if [ "$DRY" = 0 ]; then
  node --no-warnings scripts/skill-index.mjs --if-changed >>"$LOG_FILE" 2>&1 || die "indeks skill gagal"
  node --no-warnings scripts/gen-policy.mjs --check >>"$LOG_FILE" 2>&1 || die "permissions agent basi (npm run policy)"
  if command -v uvx >/dev/null; then uvx markitdown-mcp==0.0.1a8 --help >/dev/null 2>&1 && note "precache markitdown-mcp" || note "precache markitdown-mcp gagal"; fi
  if [ "$BROWSERS" = 1 ]; then
    if npx -y playwright@1.64.0-alpha-1790635538000 install chromium >>"$LOG_FILE" 2>&1; then note "browser chromium untuk playwright-mcp"; else note "pasang browser chromium gagal (opsional)"; fi
  fi
fi
# ---------- launcher (satu-satunya file di luar LUMI_HOME) ----------
ui_step "Menyiapkan launcher"
note "launcher $LUMI_BIN_DIR/lumitome"
PATH_HINT=0
if [ "$DRY" = 0 ]; then
  touch "$SW_HOME/.lumitome-home"
  L="$LUMI_BIN_DIR/lumitome"; mkdir -p "$LUMI_BIN_DIR"
  if [ -e "$L" ] && ! grep -q "LUMITOME-LAUNCHER" "$L" 2>/dev/null; then die "$L sudah ada dan bukan milik lumitome — set LUMI_BIN_DIR lain"; fi
  cat > "$L" <<LAUNCH
#!/usr/bin/env bash
# LUMITOME-LAUNCHER (dibuat install.sh; hapus: bash $PROJECT/install.sh --uninstall)
export LUMI_HOME="$SW_HOME" SW_HOME="$SW_HOME"
exec "$PROJECT/lumitome/bin/lumitome" "\$@"
LAUNCH
  chmod 0755 "$L"; note "launcher $L → $PROJECT/lumitome/bin/lumitome"
  case ":$PATH:" in *":$LUMI_BIN_DIR:"*) ;; *) PATH_HINT=1; note "$LUMI_BIN_DIR belum di PATH — tambahkan: export PATH=\"$LUMI_BIN_DIR:\$PATH\"";; esac
fi
# pindahkan log TMP ke $SW_HOME/logs/install.log bila masih tertunda
if [ "$DRY" = 0 ] && [ "$LOG_PENDING" = 1 ] && [ -f "$LOG_FILE" ]; then
  if mkdir -p "$SW_HOME/logs" 2>/dev/null && mv "$LOG_FILE" "$SW_HOME/logs/install.log" 2>/dev/null; then LOG_FILE="$SW_HOME/logs/install.log"; LOG_PENDING=0; fi
fi
note "Berikutnya: export NINEROUTER_API_KEY=… && lumitome run \"halo\" (cek: bash install.sh --doctor)"
note "Detail: $LOG_FILE"
if [ "$DRY" = 1 ]; then ui_done "Selesai — dry-run (tidak ada yang dipasang)"
else ui_done "Selesai — Lumitome v$SW_VERSION terpasang"; fi
if [ "${PATH_HINT:-0}" = 1 ]; then printf '  %s belum di PATH — tambahkan: export PATH="%s:$PATH"\n' "$LUMI_BIN_DIR" "$LUMI_BIN_DIR" >&2; fi
