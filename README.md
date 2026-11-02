<div align="center">

<img src="assets/brand/banner-1600x900.png" alt="Lumitome banner" width="100%"/>

<br/>

<img src="assets/brand/icon-256.png" alt="Lumitome icon" width="96"/>

# Lumitome

[![License: MIT](https://img.shields.io/badge/license-MIT-c9962e.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.3.6-e8c266.svg)
![Node](https://img.shields.io/badge/node-%E2%89%A522.6-a97a1e.svg)

</div>

Lumitome is a coding assistant that runs in your terminal. It is built on OpenCode, locked to version 2.2.4, and it runs separately from any OpenCode you already have installed.

You give it a task, such as "fix the failing tests". It reads your code, edits files, and runs commands to get it done.

## Install

You need Node.js 22.6 or newer. Get it from [nodejs.org](https://nodejs.org).

**Linux or macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/fahmi0812/Lumitome/main/install.sh | bash
```

This puts everything in `~/.lumitome` and adds a `lumitome` command in `~/.local/bin`.

**Windows, or any system with npm:**

```bash
npm install -g https://github.com/fahmi0812/Lumitome/tarball/main
```

Run it in PowerShell or Command Prompt. You do not need Git for this. To install one exact version instead of the latest, use `https://github.com/fahmi0812/Lumitome/archive/refs/tags/v0.3.6.tar.gz`. Once Lumitome is on the npm registry, this shorter form will also work:

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

Then connect an AI provider. Press `c` and Enter at the prompt, or run:

```bash
lumitome connect
```

It asks for a name, a base URL, and an API key. Any service that works like the OpenAI API or the Anthropic API will do. Lumitome finds the provider's models by itself. Pick one with `/model`.

Other provider commands:

- `lumitome connect --list` shows your providers.
- `lumitome connect --remove <name>` removes one.
- `lumitome models --refresh` looks up the model list again.

Your keys are saved in `~/.lumitome/credentials.json`. Only your user can read that file, and Lumitome never prints the keys.

To run one task without the interactive screen:

```bash
lumitome run "fix the failing tests"
```

### What is turned on for you

- **A main helper that hands work to specialists.** When you open `lumitome`, you talk to a coordinator. It passes each job to the right specialist (coding, research, writing, or security) and checks the result. `lumitome run` uses the plain worker, which is the safest choice when nobody is watching. To pick a different one, set `LUMI_AGENT`, for example `LUMI_AGENT=build lumitome`.
- **Five tool sets.** Code memory, plus skill libraries for coding, research, writing, and security. Finance and media are off by default. Turn everything on with `LUMI_MCP=all`, or name the ones you want: `LUMI_MCP=codemem,skills-media`.
- **Code memory.** Lumitome remembers how your project fits together, so it finds the right files faster. The first time you open Lumitome in a project folder, it reads the project quietly in the background. You can keep working while it does. It skips your home folder, system folders, and folders that do not look like a project. To turn this off: `LUMI_AUTO_INDEX=0`.

## Updating

```bash
lumitome update --check     # is there a newer version?
lumitome update             # install it
lumitome update --rollback  # go back to the version you had before
```

If you installed with npm, update with npm instead:

```bash
npm install -g https://github.com/fahmi0812/Lumitome/tarball/main
```

Lumitome does not update itself. It only updates when you run `lumitome update`. That command does not change the OpenCode version. On v0.3.1, which has no `update` command, run the install line again once.

## What it does differently

- **It asks before risky actions, not before every step.** For example, deleting files outside your project, or pushing to the `main` branch, is stopped.
- **It keeps your secrets in.** It will not read `.env` files or other secret files, and it will not send them anywhere.
- **It checks its work before saying "done".** It looks at the real result of the last test run. If the tests failed, the task is not done.
- **It leaves your own OpenCode alone.** Lumitome keeps its own copy of OpenCode in `~/.lumitome`. It does not read or change your OpenCode settings, sessions, or saved logins.
- **It does not trust a project's own settings by default.** Plugins and settings that come with a cloned project are ignored unless you turn them on with `LUMI_TRUST_PROJECT=1`.

## Uninstall

```bash
bash ~/.lumitome/src/install.sh --uninstall
```

This removes `~/.lumitome` and the `lumitome` command. Nothing else is touched.

If you installed with npm: `npm uninstall -g lumitome`, then delete the `.lumitome` folder in your home folder.

## For contributors

```bash
npm install
npm test
npm run validate
```

More detail: [`lumitome/README.md`](lumitome/README.md) (all commands and settings), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CHANGELOG.md`](CHANGELOG.md).

## Bahasa Indonesia

Lumitome adalah asisten coding yang berjalan di terminal. Dibangun di atas OpenCode versi 2.2.4 yang dikunci, dan terpisah dari OpenCode yang sudah Anda pasang.

**Pasang:** Linux/macOS: jalankan baris `curl ... install.sh | bash` di atas. Windows (atau OS apa pun yang punya npm): `npm install -g https://github.com/fahmi0812/Lumitome/tarball/main` (butuh Node.js 22.6+). Setelah terbit di npm: `npm install -g lumitome`.

**Mulai:** ketik `lumitome`, lalu tekan `c` atau jalankan `lumitome connect`. Isi nama, alamat (base URL), dan API key. Layanan apa pun yang mirip API OpenAI atau Anthropic bisa dipakai. Daftar model diambil otomatis. Pilih model dengan `/model`.

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
- Uses [OpenCode](https://github.com/anomalyco/opencode) (MIT). It is downloaded during install, not copied into this repo.
- The built-in rules are written in our own words, based on: multica-ai/andrej-karpathy-skills, obra/superpowers, poteto/noodle, unicodef1wn/grokbot-field-notes, qkal/Canny, affaan-m/ECC, alvinunreal/oh-my-opencode-slim (all MIT), and google/elephant-goldfish-model (Apache-2.0). Full list with versions: [`docs/RULES.md`](docs/RULES.md).
- Third-party skills and their licenses: [`NOTICE.md`](NOTICE.md).
