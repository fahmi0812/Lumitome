# lumitome 0.3.0

Wrapper CLI aman di atas **OpenCode v2.2.4** + harness Swanwright, provider **9router**.
`lumitome <subcommand> …`: semua argumen diteruskan ke `opencode`. Tanpa subcommand = TUI.

```bash
export NINEROUTER_API_KEY=…            # wajib; tidak pernah dicetak/ditulis wrapper
lumitome run "perbaiki tes yang gagal"  # headless (ask → deny), done-gate, anti-spin
lumitome                                # TUI interaktif (push branch non-main → prompt izin)
lumitome serve --port 4096              # password → $LUMI_HOME/serve.password (0600), tidak dicetak
```

## Lapis keamanan

| Lapis | Mekanisme | Kenapa config proyek tak bisa mengalahkan |
|---|---|---|
| Kepercayaan proyek | default `OPENCODE_DISABLE_PROJECT_CONFIG=1`: `opencode.json(c)`, `.opencode/` (plugin, agent, MCP) di workspace **tidak dimuat**. Opt-in `LUMI_TRUST_PROJECT=1` (+ peringatan) | ditetapkan wrapper sebelum OpenCode start |
| Guard | `config/plugins/lumitome-guard.ts` → `harness/lumi-guard.mjs` di `tool.execute.before` (throw = tolak) | dimuat dari `OPENCODE_CONFIG_DIR`; fail-closed (`LUMI_GUARD_CLOSED`/`SANDBOX_CLOSED`, exit 5) |
| Sandbox | tiap shell → `bwrap --args 3 …`: FS read-only kecuali workspace, `--clearenv`, `--unshare-pid`, `.env*`/`secrets.env`/kunci di-mask `/dev/null` | opsi di file args (0600), tidak terlihat pola permission |
| Permission | `OPENCODE_CONFIG_CONTENT` (sumber terakhir, last-match-wins) | dimuat setelah semua config |

Aturan guard: isi `.env*`/secret ditolak (cat/grep/read/edit/redirect/xargs/`-exec`), **daftar nama** diizinkan (`ls`, `find -name`, `test`, `stat`, tool `glob`/`list`); `.env.example` boleh. Push: force/`+`/`--all`/main/master → deny; branch lain → ask (TUI/serve) atau deny (headless). Anti-spin per-signature: setelah trip hanya aksi identik yang diblok.

Skill: harness memakai skill & DB router miliknya sendiri (`config/skills` → `.opencode/skills`, `runtime/skills.db`), ≤5 (default 3) skill hasil router yang terlihat per run. Permintaan trading → tanpa skill (tidak ada skill/MCP trading).

## Variabel lingkungan

| Env | Default | Fungsi |
|---|---|---|
| `NINEROUTER_API_KEY` | — (wajib) | key 9router; dipakai via `{env:…}` |
| `LUMI_9ROUTER_URL` | `http://127.0.0.1:20128/v1` | base URL provider |
| `LUMI_MODEL` | `9router/ag/gemini-3.8-flash-high` | model `run` (bila tanpa `-m`) |
| `LUMI_AGENT` | `build` | agent default |
| `LUMI_TRUST_PROJECT` | `0` | `1` = muat config/plugin/agent/MCP proyek (berbahaya untuk repo asing) |
| `LUMI_MCP` | `codemem,skills-coding` | MCP proyek yang tetap aktif (hanya bila trusted); `all` |
| `LUMI_SKILLS` | `auto` | `auto` = scoping router; `all` = semua skill terlihat |
| `LUMI_ROUTER_L1` | `0` | `1` = pilih skill via LLM L1 (lambat ±8 s, presisi lebih tinggi, di-cache) |
| `LUMI_DEADLINE_MS` | `300000` | batas keras satu `run` → exit 124 |
| `LUMI_FIRST_OUTPUT_MS` | `90000` | provider diam (tanpa output/aksi) → exit 124 |
| `LUMI_PREFLIGHT` / `_TIMEOUT_MS` / `_RETRIES` | `1` / `8000` / `2` | cek `GET {baseURL}` sebelum run (status HTTP apa pun = hidup) |
| `LUMI_IDLE_TIMEOUT_MS` | `60000` | header/chunk timeout provider |
| `LUMI_TOTAL_TIMEOUT_MS` | `900000` | timeout total permintaan provider |
| `LUMI_RETRIES` | `2` | retry wrapper bila timeout sebelum ada aksi |
| `LUMI_SANDBOX` | `bwrap` | `off` hanya untuk debug |
| `LUMI_DONE_GATE` | `on` | `off` mematikan done-gate |
| `LUMI_SPIN_MAX_FAIL` / `LUMI_SPIN_MAX_REPEAT` | `3` / `4` | ambang anti-spin |
| `LUMI_SERVE_PASSWORD_FILE` | `$LUMI_HOME/serve.password` | file password `serve`/`web` (0600) |
| `LUMI_HOME` | `~/.lumitome` | jurnal `runs/`, XDG data/state/cache, `sbx/` |
| `LUMI_OPENCODE` | `opencode` | path binary OpenCode |
| `LUMI_DEBUG` | — | log jurnal, skill terpilih, cleanup |
| `SW_L1_TIMEOUT_MS` / `SW_L1_TOPK` / `SW_L1_CACHE` | `12000` / `12` / `runtime/l1-cache.json` | router L1 (`SW_L1_CACHE=0` matikan cache) |
| `SW_FALLBACK_MAX` / `SW_FALLBACK_RATIO` | `3` / `0` | fallback deterministik router |

Internal (diset wrapper, jangan diisi manual): `LUMI_WORKSPACE`, `LUMI_JOURNAL`, `LUMI_RUN_ID`, `LUMI_HARNESS`, `LUMI_HEADLESS`, `LUMI_TOOLDIRS`, `LUMI_SBX_DIR`, `LUMI_WRAPPER_PID`, `SW_9ROUTER_URL`, `SW_9ROUTER_KEY`, `OPENCODE_*`.

## Exit code (`run`)

0 ok · 1 error OpenCode · 2 argumen salah (`-m` ganda, tanpa pesan, tanpa key) · 3 DONE-GATE FAIL (tes terakhir exit≠0) · 4 ANTI-SPIN (trip tanpa verifikasi lulus sesudahnya) · 5 guard tak termuat / sandbox tertutup · 124 provider diam / timeout / deadline.
