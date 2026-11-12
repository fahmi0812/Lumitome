<div align="center">

<img src="assets/brand/banner-1600x900.png" alt="Lumitome banner" width="100%"/>

<br/>

<img src="assets/brand/icon-256.png" alt="Lumitome icon" width="96"/>

# Lumitome

[![License: MIT](https://img.shields.io/badge/license-MIT-c9962e.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.3.51-e8c266.svg)
![Node](https://img.shields.io/badge/node-%E2%89%A522.6-a97a1e.svg)

</div>

Lumitome is a coding assistant that runs in your terminal. It is built on OpenCode, locked to version 2.2.4, and it runs separately from any OpenCode you already have installed.

You give it a task, such as "fix the failing tests". It reads your code, edits files, and runs commands to get it done.

900 skills in one registry across coding, writing, research, security, finance, media and misc — 734 routable; the 166-skill red-team pack stays disabled (since v0.3.27: one corpus, no dormant packs). Run `/docs-pack` to scaffold a project's 12 living docs, `/stitch-ui` to build UI from a reference image, or `/external-tools` to install an external app and connect it to the agent.

## Install

You need Node.js 22.6 or newer. Get it from [nodejs.org](https://nodejs.org).

**Linux or macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/fahmi0812/Lumitome/main/install.sh | bash
```

This puts everything in `~/.lumitome` and adds a `lumitome` command in `~/.local/bin`.

While it installs (and uninstalls) you see one status line and one line when it is done. If something goes wrong you get a short message; the full details are in `~/.lumitome/logs/install.log`.

**Windows, or any system with npm:**

```bash
npm install -g https://github.com/fahmi0812/Lumitome/tarball/main
```

Run it in PowerShell or Command Prompt. You do not need Git for this. To install one exact version instead of the latest, use `https://github.com/fahmi0812/Lumitome/archive/refs/tags/v0.3.51.tar.gz`. Once Lumitome is on the npm registry, this shorter form will also work:

```bash
npm install -g lumitome
```

The npm install downloads OpenCode 2.2.4 for your system, checks its SHA256 hash, and keeps it in `~/.lumitome` (on Windows: `%USERPROFILE%\.lumitome`). If that download fails, it tries again the first time you run `lumitome`.

On Windows, commands are not run inside a sandbox, because the Linux sandbox tool (`bwrap`) does not exist there. Lumitome's safety rules still apply: dangerous commands and secret files are still blocked.

Lumitome uses its own background server port, so it works even when your own OpenCode (`opencode serve --service`) is running.

## First run

Start it:

```bash
lumitome
```

Then connect an AI provider. The first time you run `lumitome` with no provider, a provider screen opens by itself. To open it again later, run:

```bash
lumitome connect
```

(`lumitome provider` does the same.)

Choose OpenAI or Anthropic (compatible), then fill in a name, the base URL, and your API key. The key shows as dots (•) while you type or paste it. Press Enter to save. Lumitome looks up the provider's models and tells you how many it found. Pick one with `/model`. To remove a saved provider, move to it and press Del, then `y`. Esc closes the screen.

For a local 9router, pick the **9router preset** on that screen (Tab to it, Enter) — it fills in the name and the local address `http://127.0.0.1:20128/v1`; you only type the API key. The same preset works without the screen: `lumitome connect --preset 9router --key-env NINEROUTER_API_KEY`.

Any service that works like the OpenAI API or the Anthropic API will do. If the server answers but has no models yet (for example a 9router dashboard that is still empty), the provider is still saved with an empty list and Lumitome warns you instead of failing — the models show up on their own once you add them in the dashboard, thanks to the automatic refresh.

Other provider commands:

- `lumitome connect --text` asks the same questions as plain text prompts.
- If symbols look broken in an old Windows console, run with `LUMI_ASCII=1`.

- `lumitome connect --list` shows your providers.
- `lumitome connect --remove <name>` removes one.
- `lumitome models --refresh` looks up the model list again. Since v0.3.38 the list is also refreshed automatically every time you start `lumitome` (or `lumitome run`), so a provider you add in your 9router dashboard shows up without a manual refresh. If the refresh fails (for example 9router is down), the last known list is kept and startup continues. To turn the automatic refresh off: `LUMI_AUTO_REFRESH=0`.

Your keys are saved in `~/.lumitome/credentials.json`. Only your user can read that file, and Lumitome never prints the keys.

To run one task without the interactive screen:

```bash
lumitome run "fix the failing tests"
```

### What is turned on for you

- **A main helper that hands work to specialists.** When you open `lumitome`, you talk to a coordinator. It passes each job to the right specialist (coding, research, writing, or security) and checks the result. `lumitome run` uses the plain worker, which is the safest choice when nobody is watching. To pick a different one, set `LUMI_AGENT`, for example `LUMI_AGENT=build lumitome`.
- **Auto mode is on by default.** When you open `lumitome` (or run `lumitome run`), the agent works on its own without asking you to approve every step — you can leave it running overnight, just like plain `opencode --auto`. Things that are blocked stay blocked (secrets, destructive commands, pushing to main). To turn it off for one run: `LUMI_AUTO_MODE=0 lumitome` or `lumitome --no-auto`.
- **Two tool servers.** Code memory (`codemem`, only inside a git repo) and one `skills` server that covers every sector: coding, research, writing, security, finance, and media. Each sector agent can only search its own sector. Pick servers with `LUMI_MCP`, for example `LUMI_MCP=skills`.
- **Code memory.** Lumitome remembers how your project fits together, so it finds the right files faster. The first time you open Lumitome in a project folder, it reads the project quietly in the background. You can keep working while it does. It skips your home folder, system folders, and folders that do not look like a project. To turn this off: `LUMI_AUTO_INDEX=0`. The index is refreshed automatically when the project changes (new commit or edited files); to force a re-index by hand: `lumitome index --refresh`.

## Updating

```bash
lumitome update --check     # is there a newer version?
lumitome update             # install it
lumitome update --rollback  # go back to the version you had before
```

This works the same for npm installs: `lumitome update` runs npm for you. You see one status line while it works and one line when it is done. If something goes wrong you get a short message; the full details are in `~/.lumitome/logs/update.log` (Windows: `%USERPROFILE%\.lumitome\logs\update.log`), or add `--verbose` to see them on screen. After updating, Lumitome stops its old background service so the next start uses the new version. `--rollback` is only for git installs. On npm installs, the version check no longer needs Git: if `git` is missing, Lumitome falls back to the GitHub API to find the latest release (if that fails too, the message says Git is missing and shows the manual install command).

Lumitome does not update itself. It only updates when you run `lumitome update`. That command does not change the OpenCode version. On v0.3.1, which has no `update` command, run the install line again once.

### About the OpenCode copy

Lumitome runs OpenCode 2.2.4. The only change we made is the logo on the start screen: it says LUMITOME in gold instead of "opencode". Everything else, including the colors, is plain OpenCode 2.2.4.

We built it from the official 2.2.4 source with OpenCode's own build script. The change is in [`engine/patches/logo.patch`](engine/patches/logo.patch), and the files are on the [engine-2.2.4-lumi.1](https://github.com/fahmi0812/Lumitome/releases/tag/engine-2.2.4-lumi.1) release page with their SHA256 hashes. If you want the unchanged official OpenCode instead, set `LUMI_ENGINE=upstream` before you install or run Lumitome.

### Background service

The first time you open `lumitome`, it starts a background service. Later windows and other folders reuse it, so they open faster. It restarts by itself when your config, provider keys, or Lumitome version change.

```bash
lumitome service status   # is it running?
lumitome service stop     # stop it (it starts again next time you open lumitome)
```

This only touches Lumitome's own service. An OpenCode service you run yourself is left alone.

### Model list

Models from a provider are saved when you add it with `lumitome connect`. Since v0.3.38 the list is refreshed automatically every time you start `lumitome` (or `lumitome run`), so a model your provider adds later — for example a new upstream connection in your 9router dashboard — shows up on its own. If the automatic refresh fails, the last known list is kept. If a refresh finds no models at all, the last known list is kept too (an empty answer never wipes the models you already had). To refresh by hand, or turn the automatic refresh off:

```bash
lumitome models --refresh
LUMI_AUTO_REFRESH=0 lumitome
```

A running TUI session does not pick up new models until you restart it — the model list is loaded when the TUI starts. Inside the TUI, `/refresh-models` refreshes the list and reminds you to restart. To see the saved list, `lumitome models --lumitome` (it refreshes first, like startup does).

### Windows: optional Defender exclusion

Windows Defender scans programs each time they start, which can add a few seconds when Lumitome opens. If you trust this install, you can exclude its folder (run PowerShell as administrator):

```powershell
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.lumitome\bin"
```

This is optional. Skip it if you are not sure.

## What it does differently

- **It asks before risky actions, not before every step.** For example, deleting files outside your project, or pushing to the `main` branch, is stopped.
- **It keeps your secrets in.** It will not read `.env` files or other secret files, and it will not send them anywhere.
- **It checks its work before saying "done".** It looks at the real result of the last test run. If the tests failed, the task is not done.
- **It leaves your own OpenCode alone.** Lumitome keeps its own copy of OpenCode in `~/.lumitome`. It does not read or change your OpenCode settings, sessions, or saved logins.
- **It does not trust a project's own settings by default.** Plugins and settings that come with a cloned project are ignored unless you turn them on with `LUMI_TRUST_PROJECT=1` — in a terminal you must type `ya` every session (logged to the journal, never a permanent approval); a non-TTY run logs a hard warning instead.
- **Commands can read your home folder, but only write in the current folder.** This is the default (`standard` tier) and has no settings file. Inside the sandbox your home folder and the normal system folders are read-only; the folder you started Lumitome in is the only place commands and file tools can write (plus a temporary `/tmp`), except that a `MEMORY.md` in a parent folder is writable too. Writing anywhere else stops with `LUMI_SANDBOX_OUTSIDE`. Three trust tiers: `strict` adds the Linux container (`bwrap`) and refuses to run shell commands without it; `standard` is the default (same write rules, no container); `trusted` lets the agent write anywhere in the detected project root. Set the tier for a project with `lumitome trust <strict|standard|trusted>`; the setting lives in `~/.lumitome/trust.json`, which the agent cannot read or change. Secret folders stay hidden even though your home folder is readable: `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.azure`, `~/.kube`, `~/.config/gcloud`, keyrings, browser profiles and cookies, `~/.lumitome/credentials.json`, and `.env` files. SSH to your own server works with a dedicated deploy key (`lumitome trust --deploy-key`); local `sudo` is always blocked. On Windows the same rules apply to file tools and command paths, using your user folder (`%USERPROFILE%`).

## Uninstall

```bash
bash ~/.lumitome/src/install.sh --uninstall
```

This removes `~/.lumitome` and the `lumitome` command. Nothing else is touched. Like installing, it shows one status line and one line when it is done.

If you installed with npm: `npm uninstall -g lumitome`, then delete the `.lumitome` folder in your home folder.

## For contributors

```bash
npm install
npm test
npm run validate
```

Releasing a new version: bump with `node scripts/bump-version.mjs <x.y.z> "<title>"`, fill in the CHANGELOG entry (never leave the `- TODO: isi catatan rilis` placeholder), then run the release gate: `node scripts/release.mjs <x.y.z> [--include <file> ...]`. It checks the changelog, git status, `npm run validate`, `npm test` (refusing to release when tests are skipped unless `--allow-skipped "reason"` is given), and a pre-tag updater check in a staging copy. It never commits, tags, or pushes — those steps are printed at the end for a human. The full updater simulation can only run after the tag exists; its command is printed by the gate.

More detail: [`lumitome/README.md`](lumitome/README.md) (all commands and settings), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CHANGELOG.md`](CHANGELOG.md).

## Bahasa Indonesia

Lumitome adalah asisten coding yang berjalan di terminal. Dibangun di atas OpenCode versi 2.2.4 yang dikunci, dan terpisah dari OpenCode yang sudah Anda pasang.

**Pasang:** Linux/macOS: jalankan baris `curl ... install.sh | bash` di atas. Windows (atau OS apa pun yang punya npm): `npm install -g https://github.com/fahmi0812/Lumitome/tarball/main` (butuh Node.js 22.6+). Setelah terbit di npm: `npm install -g lumitome`.

**Mulai:** ketik `lumitome`. Kalau belum ada provider, layar provider muncul sendiri (buka lagi dengan `lumitome provider`). Isi nama, alamat (base URL), dan API key; key tampil sebagai titik (•). Layanan apa pun yang mirip API OpenAI atau Anthropic bisa dipakai. Daftar model diambil otomatis. Pilih model dengan `/model`.

**Update:** `lumitome update` (instalasi npm: jalankan lagi `npm install -g https://github.com/fahmi0812/Lumitome/tarball/main`). Cek dulu dengan `lumitome update --check`. Batalkan dengan `lumitome update --rollback`.

**Bedanya:**

- Hanya bertanya atau berhenti sebelum tindakan berbahaya.
- Tidak membaca atau membocorkan file `.env` dan file rahasia lain.
- Memeriksa hasil tes sebelum bilang "selesai".
- Tidak menyentuh pengaturan dan data OpenCode milik Anda.

**Hapus:** `bash ~/.lumitome/src/install.sh --uninstall`.

## License and credits

MIT. See [`LICENSE`](LICENSE).

- Based on [fahmi0812/Swanwright](https://github.com/fahmi0812/Swanwright) (MIT).
- Uses [OpenCode](https://github.com/anomalyco/opencode) (MIT). It is downloaded during install, not copied into this repo. Our build changes only the start-screen logo ([`engine/patches/logo.patch`](engine/patches/logo.patch)).
- The built-in rules are written in our own words, based on: multica-ai/andrej-karpathy-skills, obra/superpowers, poteto/noodle, unicodef1wn/grokbot-field-notes, qkal/Canny, affaan-m/ECC, alvinunreal/oh-my-opencode-slim (all MIT), and google/elephant-goldfish-model (Apache-2.0). Full list with versions: [`docs/RULES.md`](docs/RULES.md).
- Third-party skills and their licenses: [`NOTICE.md`](NOTICE.md).
