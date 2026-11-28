<div align="center">

<img src="assets/brand/banner-1600x900.png" alt="Lumitome banner" width="100%"/>

<br/>

<img src="assets/brand/icon-256.png" alt="Lumitome icon" width="96"/>

# Lumitome

[![License: MIT](https://img.shields.io/badge/license-MIT-c9962e.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.4.1-e8c266.svg)
![Node](https://img.shields.io/badge/node-%E2%89%A522.6-a97a1e.svg)

</div>

Lumitome is a coding assistant that runs in your terminal. It is built on
OpenCode, locked to version 2.4.2, and it runs separately from any OpenCode you
already have installed.

You give it a task, such as "fix the failing tests". It reads your code, edits
files, and runs commands to get it done.

It ships 931 skills in one registry, covering coding, writing, research,
security, finance, media, and misc. 765 of them can be routed to. The
166-skill red-team pack stays disabled. Some built-in commands:

- `/docs-pack` scaffolds a project's 12 living docs.
- `/stitch-ui` builds UI from a reference image.
- `/external-tools` installs an external app and connects it to the agent.

## What's new in v0.4.1

- **Pinned OpenCode `2.4.2` (`engine-2.4.2-lumi.1`):** upgrades the default pinned engine across all 6 platforms (`linux`/`darwin`/`windows` x64 & arm64, both Lumitome build and upstream fallback) with verified SHA256 pins.
- **Safe `lumitome update` → `lumitome upgrade` transition:** Lumitome automatically detects the actually installed engine binary version (reading `.flavor` tag without spawning, or `--version` fallback) so updating Lumitome before running `lumitome upgrade` stays 100% compatible with existing `2.3.0` binaries and restarts stale background services automatically once upgraded.

## What's new in v0.4.0 (Lumitome Next)

- **Verifier-independent harness:** `lumitome-idle-gate` (`experimental.idle` bounded re-drive), `Repro-Before-Edit` (`INVALID_PROBE` filtering before bugfix edits), 5-field `ATTESTED` runtime witnesses (degrading to `STALE`/`UNSETTLED` on file mutation), context-stripped reviewer packets, and `HaltingWatchdog`.
- **Selective 4-layer memory & sticky taint:** L1–L4 working/episodic/structural/long-term memory backed by an immutable JSONL + SQLite FTS5-BM25 ledger (`L2Ledger`), paired with monotonic sticky taint (`webfetch`/external MCP → `TAINTED`, holding L4 promotion at `HOLD_FOR_APPROVAL` until explicit approval).
- **9router-only 3-tier cascade & token guard:** `LUMI_*` env precedence over legacy `SW_*`, deterministic 3-tier model cascade (never downgrading `thinking`, `reviewer`, or `design-critic`), and `LUMI_OVERTHINK_GUARD`.
- **Fail-closed `SandboxProvider` & BYOP shadow mode:** unified `NoopSandbox` (default), `BwrapSandbox`, and `RemoteSandboxAdapter` (fail-closed `SANDBOX_CLOSED`), plus BYOP Guardrail Proxy defaulting to non-blocking `shadow` mode (`LUMI_BYOP_MODE=shadow`, `350 ms` timeout).
- **Dual-mode eval & SHarP ablation:** `npm run eval` runs offline deterministic replay (`RPL-01`..`RPL-09`) or live 9router probing; `scripts/sharp-ablation.mjs` enforces permanent invariants vs prunable flags.
- **WCAG AA light theme & OpenCode `2.4.2` readiness:** light-theme contrast fixes, top-level `policies`, `output.exitCode` / `shell-bg` tracking, and `scripts/backup-data.sh` (pinned engine upgraded to `2.4.2` in v0.4.1).

## Install

You need Node.js 22.6 or newer. Get it from [nodejs.org](https://nodejs.org).

All install methods below install a **tagged release**, not whatever happens to
be on the `main` branch.

**Linux or macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/fahmi0812/Lumitome/main/install.sh | bash
```

The script looks up the newest release tag (`vX.Y.Z`), downloads that tag, and
installs it. Everything goes into `~/.lumitome`, and a `lumitome` command is
added to `~/.local/bin`.

- To install one specific version: `LUMI_REF=v0.3.79 bash` instead of `bash`.
- To install the unreleased development version: `LUMI_REF=main bash`.

While it installs (and uninstalls) you see one status line and one line when it
is done. If something goes wrong you get a short message. The full details are
in `~/.lumitome/logs/install.log`.

**Windows, or any system with npm:**

```bash
npm install -g https://github.com/fahmi0812/Lumitome/archive/refs/tags/v0.4.1.tar.gz
```

Run it in PowerShell or Command Prompt. You do not need Git for this. The
development version is `https://github.com/fahmi0812/Lumitome/tarball/main`.
Once Lumitome is on the npm registry, this shorter form will also work:

```bash
npm install -g lumitome
```

The npm install downloads OpenCode 2.4.2 for your system, checks its SHA256
hash, and keeps it in `~/.lumitome` (on Windows: `%USERPROFILE%\.lumitome`). If
that download fails, it tries again the first time you run `lumitome`.

### Windows: if PowerShell blocks `npm`

If you see this error:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

PowerShell is blocking script files (its default execution policy). Fix it in
one of these two ways. Neither needs administrator rights.

Option A (recommended): allow scripts for your user, then run the install again.

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
npm install -g https://github.com/fahmi0812/Lumitome/archive/refs/tags/v0.4.1.tar.gz
```

Option B (changes nothing): use the `npm.cmd` shim instead, or run the same
command in Command Prompt (`cmd.exe`).

```powershell
npm.cmd install -g https://github.com/fahmi0812/Lumitome/archive/refs/tags/v0.4.1.tar.gz
```

Type the command yourself, and do not paste the terminal's output back into the
prompt. Lines like `Windows PowerShell`, `Copyright (C) ...`, or
`Install the latest PowerShell ...` are not commands, and PowerShell will only
show errors for them.

## First run

Start it:

```bash
lumitome
```

Then connect an AI provider. The first time you run `lumitome` with no
provider, a provider screen opens by itself. To open it again later, run
`lumitome connect` (or `lumitome provider`).

Choose OpenAI or Anthropic (compatible), then fill in a name, the base URL, and
your API key. The key shows as dots (•) while you type or paste it. Press Enter
to save. Lumitome looks up the provider's models and tells you how many it
found. Pick one with `/model`.

- To remove a saved provider, move to it, press Del, then `y`.
- Esc closes the screen.

Any service that works like the OpenAI API or the Anthropic API will do. If the
server answers but has no models yet (for example a 9router dashboard that is
still empty), the provider is still saved with an empty list and Lumitome warns
you instead of failing. The models show up once you add them in the dashboard.

### 9router

For a local 9router, pick the **9router preset** on the provider screen (Tab to
it, then Enter). It fills in the name and the local address
`http://127.0.0.1:20128/v1`, so you only type the API key. The same preset works
without the screen:

```bash
lumitome connect --preset 9router --key-env NINEROUTER_API_KEY
```

If 9router answers **403**, or your account is **"not eligible"** for
Antigravity / Gemini Code Assist (stale OAuth credentials, stuck phone
verification), the external tool
[antigravity-fixer](https://github.com/fulldiagnose/antigravity-fixer)
(Python 3.10+, MIT) diagnoses and fixes those eligibility errors. Clone it, run
`pip install -r requirements.txt`, and follow its README. 
**Read the tool before running it.** It touches OAuth credentials, so never run
it blind.

### Other provider commands

- `lumitome connect --text` asks the same questions as plain text prompts.
- `lumitome connect --list` shows your providers.
- `lumitome connect --remove <name>` removes one.
- `lumitome models --refresh` looks up the model list again (see
  [Model list](#model-list)).
- If symbols look broken in an old Windows console, run with `LUMI_ASCII=1`.

Your keys are saved in `~/.lumitome/credentials.json`. Only your user can read
that file, and Lumitome never prints the keys.

To run one task without the interactive screen:

```bash
lumitome run "fix the failing tests"
```

### What is turned on for you

- **A coordinator that hands work to specialists.** When you open `lumitome`,
  you talk to a coordinator (the orchestrator agent). It passes each job to the
  right specialist (coding, research, writing, or security) and checks the
  result. `lumitome run` uses the plain worker instead, which is the safer
  choice when nobody is watching. To pick a different agent, set `LUMI_AGENT`,
  for example `LUMI_AGENT=build lumitome`.
- **Auto mode.** The agent works on its own without asking you to approve every
  step, like plain `opencode --auto`. Blocked actions stay blocked (see
  [Safety model](#safety-model)). To turn it off for one run:
  `LUMI_AUTO_MODE=0 lumitome` or `lumitome --no-auto`.
- **Two tool servers.** Code memory (`codemem`, only inside a git repo) and one
  `skills` server that covers every sector. Each sector agent can only search
  its own sector. Pick servers with `LUMI_MCP`, for example `LUMI_MCP=skills`.
- **Code memory.** Lumitome remembers how your project fits together, so it
  finds the right files faster. The first time you open Lumitome in a project
  folder, it reads the project in the background while you keep working. It
  skips your home folder, system folders, and folders that do not look like a
  project. The index refreshes when the project changes (a new commit or edited
  files). Force a re-index with `lumitome index --refresh`; turn it off with
  `LUMI_AUTO_INDEX=0`.

## Safety model

Lumitome's defaults favor getting work done without interruptions. Know what
that means before you leave it running unattended.

**What is on by default:**

- **Auto mode.** The agent runs commands and edits files without asking first.
- **No sandbox.** Since v0.3.71 commands can read and write anywhere your user
  can, like plain OpenCode. On Linux you can opt into the `bwrap` container with
  `LUMI_SANDBOX=bwrap`.

Together, these mean a wrong command runs without a prompt. The guard rules
below are the protection that remains.

**What is always blocked**, in every mode:

- **Secrets stay hidden.** The agent cannot read `.env` files, `~/.ssh`,
  `~/.gnupg`, `~/.aws`, `~/.azure`, `~/.kube`, `~/.config/gcloud`, keyrings,
  browser profiles and cookies, or `~/.lumitome/credentials.json`, and it will
  not send them anywhere.
- **Code Mode `execute` policy (`execute-policy`).** Inside `execute`, access to
  `.env`/secrets, `process.env`/`Bun.env` dumps, `opencode:///api/`, and
  destructive/forbidden git or shell calls is denied.
- **TCB hard-deny (`tcb-protected`).** Writes to `$LUMI_HOME/**`,
  `.git/hooks/**`, and `.git/config` are blocked; edits to repo TCB files
  require maintainer trust (`LUMI_MAINTAINER_MODE=1` or trusted `trust.json`)
  on a non-`main`/`master` branch.
- **Risky actions are stopped.** Examples: deleting files outside your project,
  pushing to the `main` branch, and running local `sudo`.
- **SSH only with a deploy key.** SSH to your own server works with a dedicated
  deploy key (`lumitome trust --deploy-key`).

**Other safeguards:**

- **Fail-closed sandbox & BYOP shadow default.** `BwrapSandbox` and
  `RemoteSandboxAdapter` fail closed (`SANDBOX_CLOSED`) when `bwrap` or remote
  endpoints are unavailable or credential mounts are attempted. BYOP guardrails
  default to non-blocking `shadow` mode (`enforce` requires a verified probe
  report with `FPR < 0.01` and `p95_ms <= 350`).
- **It checks its work before saying "done".** It looks at the real result of
  the last test run (`shell-bg` stays `UNRUN`/fail until completed) and runtime
  `ATTESTED` witnesses. If tests failed or witnesses went `STALE`, the task is
  not done.
- **It does not trust a project's own settings.** Plugins and settings that come
  with a cloned project are ignored unless you set `LUMI_TRUST_PROJECT=1`. Even
  with `LUMI_TRUST_PROJECT=1`, Lumitome pre-scans project configs for `policies`
  blocks and forces `OPENCODE_DISABLE_PROJECT_CONFIG=1` if found. In a terminal
  you must then type `ya` every session. That approval is logged to the journal
  and is never permanent. A non-interactive run logs a hard warning instead.
- **It leaves your own OpenCode alone.** Lumitome keeps its own copy of OpenCode
  in `~/.lumitome`. It does not read or change your OpenCode settings, sessions,
  or saved logins. It also uses its own background server port, so it works
  even while your own `opencode serve --service` is running.

**Safer setup for unattended runs:** `LUMI_AUTO_MODE=0` (or `--no-auto`), plus
`LUMI_SANDBOX=bwrap` on Linux.

## Updating

```bash
lumitome update --check     # is there a newer version?
lumitome update             # install it
lumitome update --rollback  # go back to the version you had before (git installs only)
```

Updates always move to a release tag. This works the same for npm installs:
`lumitome update` runs npm for you. You see one status line while it works and
one line when it is done. If something goes wrong you get a short message. The
full details are in `~/.lumitome/logs/update.log`
(Windows: `%USERPROFILE%\.lumitome\logs\update.log`), or add `--verbose` to see
them on screen.

After updating, Lumitome stops its old background service so the next start
uses the new version. On npm installs the version check does not need Git: if
`git` is missing, Lumitome asks the GitHub API for the latest release. If that
fails too, the message says Git is missing and shows the manual install command.

Lumitome never updates itself; it only updates when you run `lumitome update`.
On v0.3.1, which has no `update` command, run the install line again once.

### Upgrading the OpenCode engine

`lumitome update` updates Lumitome without changing your OpenCode binary. Because
Lumitome detects the installed binary version automatically, running
`lumitome update` before `lumitome upgrade` stays 100% compatible with an older
`2.3.0` engine. To upgrade the engine afterwards, run `lumitome upgrade` with no
arguments (optional backup first: `bash scripts/backup-data.sh backup`). It
installs the pinned version (`2.4.2`, tag `engine-2.4.2-lumi.1`) and verifies
its checksum. Restart the TUI afterwards so the new engine takes effect. For
manual or advanced use, `lumitome upgrade-engine <version> --sha256 <hash>` is
still available.

### About the OpenCode copy

The only change Lumitome makes to OpenCode 2.4.2 is the start-screen logo: it
says LUMITOME in gold instead of "opencode". Everything else, including the
colors, is plain OpenCode 2.4.2.

It is built from the official 2.4.2 source with OpenCode's own build script.
The change is in [`engine/patches/logo.patch`](engine/patches/logo.patch), and
the files are on the
[engine-2.4.2-lumi.1](https://github.com/fahmi0812/Lumitome/releases/tag/engine-2.4.2-lumi.1)
release page with their SHA256 hashes. To use the unchanged official OpenCode
instead, set `LUMI_ENGINE=upstream` before you install or run Lumitome.

### Background service

The first time you open `lumitome`, it starts a background service. Later
windows and other folders reuse it, so they open faster. It restarts by itself
when your config, provider keys, or Lumitome version change.

```bash
lumitome service status   # is it running?
lumitome service stop     # stop it (it starts again next time you open lumitome)
```

This only touches Lumitome's own service. An OpenCode service you run yourself
is left alone.

### Model list

Models are saved when you add a provider with `lumitome connect`. Since v0.3.38
the list is also refreshed every time you start `lumitome` (or `lumitome run`),
so a model your provider adds later shows up on its own. For example, a new
upstream connection in your 9router dashboard.

If the refresh fails (for example 9router is down), or finds no models at all,
the last known list is kept and startup continues. An empty answer never wipes
the models you already had.

```bash
lumitome models --refresh     # refresh by hand
lumitome models --lumitome    # show the saved list (refreshes first)
LUMI_AUTO_REFRESH=0 lumitome  # turn the automatic refresh off
```

A running TUI session does not pick up new models until you restart it, because
the model list is loaded when the TUI starts. Inside the TUI,
`/refresh-models` refreshes the list and reminds you to restart.

### Role delegation (`/subagent`)

In the TUI (orchestrator agent), `/subagent` opens a plugin popup where you
choose which 9router model each of the four roles uses (Thinking, Search,
Build, Review) and whether they run serial or parallel. `/subagent tabel` shows
the same choices as one table. `/subagent off` disables the role system, and
`/subagent on` turns it back on. Default is on, but it stays dormant until you
call it.

While it is on, delegation is enforced in plugin code: the orchestrator loses
its direct edit and shell tools and can only work through the roles.

Full details (saving, when changes apply, where settings live, enforcement,
metrics): [`docs/SUBAGENT.md`](docs/SUBAGENT.md).

### Windows: optional Defender exclusion

Windows Defender scans programs each time they start, which can add a few
seconds when Lumitome opens. If you trust this install, you can exclude its
folder (run PowerShell as administrator):

```powershell
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.lumitome\bin"
```

This is optional. Skip it if you are not sure.

## Uninstall

```bash
bash ~/.lumitome/src/install.sh --uninstall
```

This removes `~/.lumitome` and the `lumitome` command. Nothing else is touched.
Like installing, it shows one status line and one line when it is done.

If you installed with npm: run `npm uninstall -g lumitome`, then delete the
`.lumitome` folder in your home folder.

## For contributors

```bash
npm install
npm test
npm run eval
npm run validate
npm run lint
```

CI (`.github/workflows/ci.yml`) runs lint, `validate:offline`, and the tests on
every push to `main` and every pull request.

**Lint gate.** `scripts/lint.mjs` has no dependencies and never asks anything.
Its rules:

- LINT-001: no hardcoded catalog counts (`.length ===/!==` a literal ≥ 10).
  Count dynamically (lesson of v0.3.47).
- LINT-002: no `process.exit` in `lumitome/lib/`, except an allowlist with
  reasons (`codemem-mcp-shim.mjs`, `provider-ui.mjs`).
- LINT-003: no `console.*(` calls in `lumitome/lib/`.
- LINT-004: layer boundaries. `router/` imports nothing outside itself, and
  `harness/lumi-guard.mjs` imports only `node:*`.
- LINT-005: no new direct `SW_*` env keys outside `lumitome/lib/env-compat.mjs`
  and annotated legacy compat lines (`env-compat-allow`).
- LINT-006: single OpenCode engine version source — no hardcoded `"2.3.0"` /
  `"2.4.2"` literals in code files (`*.mjs`, `*.ts`, `*.sh`) outside
  `lumitome/lib/engine.mjs` and `install.sh`.

`npm run validate` runs lint and fails if lint fails. Principle: a new
correction becomes a lint rule, not a new skill or prompt addition.

**Releasing a new version.**

1. Bump with `node scripts/bump-version.mjs <x.y.z> "<title>"`.
2. Fill in the CHANGELOG entry. Never leave the `- TODO: isi catatan rilis`
   placeholder.
3. Run the release gate: `node scripts/release.mjs <x.y.z> [--include <file> ...]`.
   It checks the changelog, git status, `npm run validate`, and `npm test`
   (it refuses to release when tests are skipped unless you pass
   `--allow-skipped "reason"`), and runs a pre-tag updater check in a staging
   copy.
4. Commit, then **push the `v<x.y.z>` tag.** The gate never commits, tags, or
   pushes; it prints those steps for you. The installer and `lumitome update`
   only see versions that have a tag, so an untagged version never reaches
   users.

The full updater simulation can only run after the tag exists; the gate prints
its command.

More detail: [`lumitome/README.md`](lumitome/README.md) (all commands and
settings), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CHANGELOG.md`](CHANGELOG.md)
(older versions in [`docs/changelog/`](docs/changelog/)).

## Bahasa Indonesia

Lumitome adalah asisten coding yang berjalan di terminal. Dibangun di atas
OpenCode versi **2.4.2** terpin ([`engine-2.4.2-lumi.1`](https://github.com/fahmi0812/Lumitome/releases/tag/engine-2.4.2-lumi.1)),
dan terpisah dari OpenCode yang sudah Anda pasang.

**Yang baru di v0.4.1 & v0.4.0:** engine terpin naik ke OpenCode `2.4.2`
(`engine-2.4.2-lumi.1`, 6 platform) dengan deteksi versi binary terpasang agar
alur `lumitome update` → `lumitome upgrade` tetap 100% aman bagi pengguna `2.3.0`,
melanjutkan fitur Lumitome Next v0.4.0: verifier-independent gates
(`lumitome-idle-gate`, `Repro-Before-Edit` + `INVALID_PROBE`, witness
`ATTESTED` 5-field & degradasi `STALE`/`UNSETTLED`, reviewer bebas-narasi,
`HaltingWatchdog`), memori selektif 4-lapis (L1–L4) + ledger FTS5-BM25 +
Monotonic Sticky Taint, cascade 3-tier khusus `9router` + `LUMI_OVERTHINK_GUARD`,
`SandboxProvider` fail-closed + BYOP shadow mode, serta eval dual-mode
(`npm run eval`) + ablasi SHarP.

**Pasang** (selalu memasang rilis bertag, bukan isi `main`):

- Linux/macOS: jalankan baris `curl ... install.sh | bash` di atas. Versi
  tertentu: `LUMI_REF=v0.4.1 bash`; versi pengembangan: `LUMI_REF=main bash`.
- Windows (atau OS apa pun yang punya npm, butuh Node.js 22.6+):
  `npm install -g https://github.com/fahmi0812/Lumitome/archive/refs/tags/v0.4.1.tar.gz`.
  Setelah terbit di npm: `npm install -g lumitome`.

**Mulai:** ketik `lumitome`. Kalau belum ada provider, layar provider muncul
sendiri (buka lagi dengan `lumitome provider`). Isi nama, alamat (base URL), dan
API key; key tampil sebagai titik (•). Layanan apa pun yang mirip API OpenAI
atau Anthropic bisa dipakai. Daftar model diambil otomatis. Pilih model dengan
`/model`.

**Update & Upgrade engine:** jalankan `lumitome update` lalu `lumitome upgrade`
(opsional backup sebelum upgrade: `bash scripts/backup-data.sh backup`).
`lumitome update` aman dijalankan sebelum `lumitome upgrade` karena Lumitome
mendeteksi versi binary engine yang terpasang secara otomatis (tetap kompatibel
dengan binary `2.3.0`). Cek update dulu dengan `lumitome update --check`,
batalkan dengan `lumitome update --rollback`. `lumitome upgrade` (tanpa argumen)
menaikkan engine OpenCode ke versi terpin `2.4.2` (`engine-2.4.2-lumi.1`)
dengan checksum terverifikasi; restart TUI sesudahnya (untuk manual:
`lumitome upgrade-engine <versi> --sha256 <hash>`).

**Keamanan:** secara default mode auto menyala dan sandbox mati (`NoopSandbox`),
jadi agen menjalankan perintah tanpa bertanya. Yang selalu diblokir: membaca
`.env` dan file rahasia lain (termasuk lewat Code Mode `execute-policy`),
mengubah path TCB (`tcb-protected`), menimpa `policies` lewat config proyek saat
`LUMI_TRUST_PROJECT=1`, menghapus file di luar proyek, push ke `main`, dan
`sudo` lokal. Untuk dijalankan tanpa diawasi, pakai `LUMI_AUTO_MODE=0` dan
(di Linux) `LUMI_SANDBOX=bwrap`.

**Hapus:** `bash ~/.lumitome/src/install.sh --uninstall`.

## License and credits

MIT. See [`LICENSE`](LICENSE).

- Based on [fahmi0812/Swanwright](https://github.com/fahmi0812/Swanwright) (MIT).
  Some internal names (the `swanwright` plugin id, `SW_*` variables, and the
  `swanwright_*` skill metadata keys) still come from it.
- Uses [OpenCode](https://github.com/anomalyco/opencode) (MIT). It is downloaded
  during install, not copied into this repo. Our build changes only the
  start-screen logo ([`engine/patches/logo.patch`](engine/patches/logo.patch)).
- The built-in rules are written in our own words, based on:
  multica-ai/andrej-karpathy-skills, obra/superpowers, poteto/noodle,
  unicodef1wn/grokbot-field-notes, qkal/Canny, affaan-m/ECC,
  alvinunreal/oh-my-opencode-slim (all MIT), and google/elephant-goldfish-model
  (Apache-2.0). Full list with versions: [`docs/RULES.md`](docs/RULES.md).
- Third-party skills and their licenses: [`NOTICE.md`](NOTICE.md).
