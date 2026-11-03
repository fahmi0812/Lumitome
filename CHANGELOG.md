# Changelog

## Belum dirilis

## 0.3.16 — Sandbox seperti Codex: baca $HOME, tulis folder kerja

- Default baru, aktif tanpa config: seluruh `$HOME` dan path sistem bisa dibaca (read-only), hanya folder kerja yang bisa ditulis (plus `/tmp` sementara). Proyek di `~/Documents` bisa membaca file di `~/Downloads`, tapi tidak bisa menulis ke sana.
- Dihapus: deteksi akar proyek (`.git`, `MEMORY.md`, `AGENTS.md`, `.lumitome/workspace`) dan `.lumitome/sandbox.json`. File `sandbox.json` yang sudah ada diabaikan.
- Folder rahasia di `$HOME` disamarkan di bwrap dan ditolak di tool file host dan perintah shell: `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.azure`, `~/.kube`, `~/.config/gcloud`, `~/.docker/config.json`, keyring, profil/cookie browser (Chrome, Chromium, Brave, Edge, Firefox), `~/.lumitome/credentials.json`, `.netrc`, `.npmrc`, `.git-credentials`. File `.env` di bawah `$HOME` juga di-mask (pencarian dibatasi kedalaman 4).
- Tool file host dan cek path shell memakai aturan yang sama. Tulis di luar folder kerja (redirect, `tee`, `cp`, `mv`, `touch`, edit/patch) ditolak dengan `LUMI_SANDBOX_OUTSIDE`. Windows memakai aturan yang sama dengan `%USERPROFILE%`.
- Di dalam bwrap `HOME` sekarang `$HOME` asli (read-only); cache diarahkan ke `/tmp/.cache`.

## 0.3.15 — Sandbox bisa membaca folder induk proyek

- Masalah: sandbox bwrap hanya memasang folder kerja. Tool cari/baca melihat file di folder induk (mis. `../../Template Laporan.docx`), tapi `python` di shell mendapat `FileNotFoundError`.
- Lumitome sekarang mencari akar proyek: naik dari folder kerja sampai menemukan `.git`, `MEMORY.md`, `AGENTS.md` atau `.lumitome/workspace`. Tidak pernah melewati `$HOME`, dan `/` atau `$HOME` tidak pernah jadi akar. Tanpa penanda, akar = folder kerja.
- Di bwrap, akar proyek dipasang read-only, folder kerja tetap bisa ditulis. File rahasia di akar tetap disamarkan.
- Config opsional `.lumitome/sandbox.json`: `{"read":[...],"write":[...]}`. `~` dan path relatif (terhadap akar) didukung. `/` ditolak, write ke `$HOME` ditolak.
- Tool file host (read/grep/edit/write/patch) memakai daftar path yang sama. Tulis di luar folder kerja, atau baca di luar akar, ditolak dengan pesan `LUMI_SANDBOX_OUTSIDE` yang menyebut cara mengizinkannya. Shell yang menyebut path `~/...` atau `../...` di luar sandbox juga ditolak dengan pesan yang sama. Aturan ini juga berlaku di Windows (tanpa bwrap) untuk tool file.
- Belum ada dialog izin (sekali / selalu / tolak); plugin guard hanya bisa menolak. Izin permanen lewat `sandbox.json`.

## 0.3.14 — `lumitome update` yang sederhana

- Tampilan baru: logo LUMITOME emas, satu baris status dengan spinner (Memeriksa, Mengunduh, Memasang, Merapikan), lalu satu baris hasil `Selesai — vX.Y.Z`. Kalau sudah terbaru: satu baris `Sudah versi terbaru`. `--check` juga satu baris.
- Error tampil sebagai satu kalimat singkat plus saran. Detail teknis selalu ditulis ke `~/.lumitome/logs/update.log`, dan tampil di layar dengan `--verbose` atau `LUMI_DEBUG=1`.
- Instalasi npm: `lumitome update` sekarang menjalankan `npm install -g` ke tarball rilis sendiri. Output npm hanya masuk ke log.
- Sesudah update, config dimigrasi dan service latar lama milik Lumitome dihentikan otomatis. Tidak perlu lagi mematikan proses lewat PowerShell.
- Terminal non-TTY / CI: baris polos tanpa animasi dan tanpa warna. Konsol Windows non-UTF-8 atau `LUMI_ASCII=1`: spinner dan logo ASCII.
- Backup, rollback otomatis bila versi baru gagal jalan, dan `--rollback` tetap sama. Engine tidak diubah.

## 0.3.13 — Lumitome terbuka lebih cepat; model langsung tampil

- Penyebab terbesar: plugin guard memuat modul harness dengan import relatif literal. Dari salinan di `~/.lumitome/config/plugins`, path itu tidak ada, sehingga engine memantau folder induk terdekat secara rekursif (mis. `C:\Users` atau `/home`) setiap folder dibuka. Import sekarang dibangun saat runtime. Tidak ada `.git` yang dibuat di folder user, dan engine tidak diubah.
- Service latar milik Lumitome tidak lagi dimatikan saat keluar (Linux), dan dipakai ulang lintas folder. Service dimulai ulang otomatis bila config, key provider, atau versi berubah. Perintah baru: `lumitome service status`, `lumitome service stop`. Service OpenCode milik user tidak disentuh.
- Guard memakai folder sesi yang sedang dibuka sebagai workspace (sebelumnya folder pertama yang membuka service).
- Empat MCP `skills-<sektor>` digabung jadi satu proses `skills` untuk semua sektor. Tool menjadi `<sektor>_skill_search`; agent sektor hanya boleh tool sektornya. Skill offensive tetap `ask`.
- codemem hanya berjalan di repo git (lewat shim kecil; di luar git MCP-nya kosong). Auto-index juga hanya di repo git. Batas start 60 s → 15 s. stderr codemem ditulis ke `~/.lumitome/logs/codemem.err`.
- Perbaikan: pesan timeout `lumitome run` memakai variabel `idle` yang terhapus di 0.3.11.
- Diukur di Linux (box): waktu sampai model tampil 12,2 s → 1,7 s (folder non-git pertama), 12,8 s → 1,4 s (folder non-git lain), 3,5 s → 1,4 s (git).

## 0.3.12 — 401 "Invalid/Missing API key" di server latar; compaction.buffer valid

- Config dasar memakai `{env:NINEROUTER_API_KEY}`, padahal wrapper hanya mengisi `LUMI_KEY_9ROUTER` dari `credentials.json`. Server engine yang berjalan tanpa variabel itu mengirim key kosong ke 9router. Sekarang config dasar memakai `{env:LUMI_KEY_9ROUTER}`, dan wrapper selalu mengisi `LUMI_KEY_9ROUTER` dan `NINEROUTER_API_KEY` (dari env atau `credentials.json`) untuk semua perintah, termasuk `lumitome serve --service`.
- `compaction.buffer: "20%"` tidak valid di engine 2.2.4 (hanya integer token; persen baru ada di 2.2.5). Diganti `20000`.
- Salinan config lama di `~/.lumitome/config/opencode.jsonc` dimigrasi otomatis saat `lumitome update` dan saat `lumitome` dijalankan. Key tidak pernah ditulis ke file config.

## 0.3.11 — Jawaban panjang tidak lagi terputus "Timed out waiting for response data"

- Sebelumnya wrapper memasang batas jeda antar-chunk 60 detik ke provider. Model reasoning lewat proxy (mis. 9router) bisa diam lebih lama di tengah jawaban, lalu request diputus, di-retry, dan pesan ditandai interrupted.
- Default baru, sama untuk 9router dan semua provider custom: `LUMI_HEADER_TIMEOUT_MS`=300000 (header), `LUMI_IDLE_TIMEOUT_MS`=900000 (jeda antar-chunk), `LUMI_TOTAL_TIMEOUT_MS`=3600000 (total). Bisa ditimpa lewat env; nilai tidak valid kembali ke default. Engine tidak diubah.

## 0.3.10 — `lumitome connect` membuka layar provider; logo tidak dobel

- `lumitome connect` di terminal sekarang membuka layar provider yang sama dengan `lumitome provider`. Mode teks lama hanya untuk non-TTY, `lumitome connect --text`, atau bila flag (`--type/--name/--base-url/--key-env/--key-stdin/--list/--remove`) dipakai.
- Banner wrapper ("The book of light…") tidak lagi dicetak sebelum TUI; wordmark LUMITOME dari engine cukup. Judul jendela tetap `Lumitome`. Pesan Windows soal sandbox hanya muncul dengan `LUMI_DEBUG=1`.
- Konsol Windows yang bukan UTF-8 (codepage ≠ 65001, di luar Windows Terminal) memakai simbol ASCII di layar provider: `*` untuk key, `x` untuk hapus, logo teks. Paksa dengan `LUMI_ASCII=1` / `LUMI_ASCII=0`.

## 0.3.9 — Layar provider; API key tampil sebagai •

- BARU layar provider (`lumitome/lib/provider-ui.mjs`, Node murni): logo LUMITOME emas, daftar provider tersimpan (`nama  N model  ×`, Del → konfirmasi y), form Tipe (OpenAI · Anthropic compatible) / Nama / Base URL / API Key, status `✓ Terhubung · N model terdeteksi`. Muncul otomatis saat `lumitome` dibuka tanpa provider; buka lagi dengan `lumitome provider`. Penyimpanan sama dengan `lumitome connect` (providers.json + credentials.json 0600, key lewat env ke engine).
- PERBAIKAN Windows: API key di `lumitome connect` tidak lagi kosong/tak terlihat; tampil • per karakter. Backspace `\b` dan DEL, Enter CRLF, bracketed paste dan paste biasa ditangani.
- Batasan: `/provider` di dalam TUI engine belum ada (butuh patch engine); di TUI tetap ada `/connect` bawaan OpenCode.

## 0.3.8 — Logo LUMITOME di layar awal; hanya logo yang emas

- Engine sekarang build Lumitome dari OpenCode v2.2.4 (tag upstream `v2.2.4`, commit 45898d0). Satu-satunya perubahan: tulisan blok di layar awal jadi `LUMITOME` berwarna emas (`LUMI` emas tua + `TOME` champagne). Patch: `engine/patches/logo.patch`. Binary dibangun dengan skrip build upstream (Bun 1.4.4) dan dirilis di `engine-2.2.4-lumi.1` (linux x64/arm64, darwin x64/arm64, windows x64/arm64), terpin SHA256 di `lumitome/lib/engine.mjs` dan `install.sh`.
- Theme kembali ke tampilan bawaan OpenCode; theme `lumitome` tidak lagi di-seed. Instalasi v0.3.7 dilepas dari theme `lumitome` sekali saja (penanda `$LUMI_HOME/config/.theme-default-v038`); kalau dipilih lagi lewat `<leader>t`, pilihan itu dihormati.
- `LUMI_ENGINE=upstream` → pakai binary resmi OpenCode v2.2.4 (pin lama). Engine lama tidak dihapus bila unduhan gagal; tanpa engine dan build Lumitome gagal → otomatis jatuh ke upstream. `lumitome engine` menampilkan build yang terpasang. Auto-update engine tetap mati.

## 0.3.7 — Branding Lumitome (white-gold / champagne)

- BARU theme OpenCode `lumitome` (`lumitome/config/themes/lumitome.json`, varian dark & light) dari palet brand kit `assets/brand` (#FFF8DC → #F3D27A → #E8C266 → #C9962E → #9C6F17). Jadi default lewat `cli.json` terisolasi di `$LUMI_HOME/config`; theme yang dipilih user (`<leader>t`) dihormati. Logo layar awal ikut berwarna emas.
- Judul jendela/tab terminal = `Lumitome` (OSC 0; `terminal.title: false` agar engine tidak menimpanya dengan "OpenCode"). Linux, macOS, Windows Terminal/PowerShell.
- Banner `Lumitome` gradasi white-gold → champagne saat TUI dibuka (truecolor, fallback 256 warna, polos bila `NO_COLOR`/non-TTY/`TERM=dumb`). Matikan semua branding: `LUMI_NO_BRAND=1`.
- Batasan: tulisan blok "opencode" di layar awal di-hardcode di engine v2.2.4 (`packages/tui/src/logo.ts`, tanpa config/slot plugin). Binary engine tetap terpin SHA256 & tidak dipatch.


- BARU skill `drawio-diagram` (sektor penulisan): diagram draw.io/diagrams.net (.drawio, .drawio.svg), berbasis [DayuanJiang/next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) @ `c9dc5f5` (Apache-2.0). Alias id/en ("diagram draw.io", "diagrams.net", "aws diagram", …). Skill aktif: 87.
- BARU MCP opsional `drawio` (`@next-ai-drawio/mcp-server@0.4.11`, terpin): mati default, tidak ikut `LUMI_MCP=all`; nyalakan dengan menyebutnya, mis. `LUMI_MCP=codemem,skills-coding,skills-riset,skills-penulisan,skills-security,drawio`. Tool `drawio_*` hanya untuk sektor penulisan.

## 0.3.6 — Default baru: orchestrator, 5 MCP, code memory di mana saja

- Default MCP: `codemem`, `skills-coding`, `skills-riset`, `skills-penulisan`, `skills-security`. `skills-finance`/`skills-media` hanya lewat `LUMI_MCP=all` atau daftar eksplisit. Skill `*offensive*` tetap `ask`.
- `codemem` (codebase-memory-mcp v0.12.1) kini didaftarkan wrapper secara global dengan path absolut `$LUMI_HOME/bin/codebase-memory-mcp[.exe]` — aktif di proyek mana pun, tidak lagi hanya dari config proyek Swanwright. Binary tidak ada → dilewati dengan satu baris pemberitahuan. `codebase-memory-mcp install` tidak pernah dijalankan.
- npm/Windows: postinstall & first-run memasang codebase-memory-mcp v0.12.1 (SHA256 terpin per platform: linux/darwin/win32 × x64/arm64). Gagal unduh tidak fatal.
- Auto-index: `lumitome` (TUI/run) di folder proyek yang belum diindeks memulai `codebase-memory-mcp cli index_repository` di latar (detached, prioritas rendah). Dilewati di HOME, root, folder sistem, atau tanpa penanda proyek (.git, package.json, pyproject.toml, go.mod, Cargo.toml, …). Status di `$LUMI_HOME/codemem-index.json`. Matikan: `LUMI_AUTO_INDEX=0`.
- Agent default TUI = `orchestrator` (deskripsi agent kini "Lumitome"). `lumitome run` headless tetap `build`. `LUMI_AGENT` tetap menimpa.
- FIX registry skill: `router/skills-registry.json` berisi 121 entri padahal skill aktif 86. Penyebabnya: importer lama memindai semua SKILL.md upstream, termasuk salinan per-harness (`.trae/`, `.agent/`, `.rovodev/` …), lalu memberi akhiran -2..-25 dan memasukkan entri pack ke registry aktif. Sekarang registry dibangkitkan `scripts/gen-registry.mjs` (`npm run skills:registry`) dan isinya sama dengan folder `.opencode/skills`. Metadata pack pindah ke `packs/<pack>/registry.json`. Salinan cermin (66, mis. `impeccable-2..25`, `design-2`) ditandai `mirror_of` dan tidak diindeks router; foldernya tetap ada. `validate` memeriksa registry == folder. Presisi router (test) tetap 0.938.

## 0.3.5 — Perbaikan Windows

- FIX Windows: `lumitome` gagal dengan ERR_UNSUPPORTED_ESM_URL_SCHEME karena import() dinamis menerima path mentah `C:\...`. Kini semua memakai pathToFileURL (wrapper + plugin guard).
- FIX Windows: LUMI_TOOLDIRS dipisah dengan path.delimiter (`;`), bukan `:`.

## 0.3.4 — Rilis tag untuk perbaikan pasca-0.3.3

- postinstall npm lebih aman (tidak menggagalkan instalasi bila unduh engine gagal; dicoba lagi saat first-run).
- `lumitome update` pada instalasi npm kini menyarankan `npm install -g https://github.com/fahmi0812/Lumitome/tarball/main` (bukan `github:` yang bisa gagal).
- README: instalasi npm via tarball GitHub.

## 0.3.3 — Port service sendiri + instalasi npm (Windows)

- FIX: `lumitome` (TUI) gagal dengan `Managed service port 49374 ... already in use` bila OpenCode milik user (`opencode serve --service`) sedang jalan. Penyebab: TUI OpenCode 2.2.4 memakai background server ("managed service") dengan port default 49374; state & registrasi Lumitome sudah terpisah, tapi port tidak. Kini wrapper menulis port milik Lumitome ke `$LUMI_HOME/config/service.json` (deterministik per LUMI_HOME, 50000–59999; pindah otomatis bila terpakai proses lain; override `LUMI_SERVICE_PORT`). Registrasi service tetap di `$LUMI_HOME/state/opencode/`. Service milik user tidak pernah dipakai ulang, disentuh, atau dimatikan.
- BARU instalasi npm untuk Windows/macOS/Linux: `npm install -g https://github.com/fahmi0812/Lumitome/tarball/main` (tarball GitHub, tanpa Git; nanti `npm install -g lumitome`). Bentuk `github:`/`git+https:` tidak disarankan: `github:` mencoba SSH dulu, dan npm 10 global-install dari git membuat symlink ke folder sementara. Bin `lumitome` = `lumitome/bin/cli.mjs` (Node, tanpa bash). postinstall/first-run mengunduh engine OpenCode 2.2.4 untuk platform (linux/darwin x64/arm64, win32 x64/arm64), verifikasi SHA256 terpin, simpan di `~/.lumitome` (`%USERPROFILE%\.lumitome`). Tanpa auto-update.
- Wrapper aman untuk Windows: `opencode.exe`, junction/salin alih-alih symlink, tanpa `/proc`/`setpriv`/`sleep`; tanpa bwrap → sandbox OS mati, guard Lumitome tetap aktif.
- Config dir tidak lagi bergantung pada symlink `lumitome/config/{skills,agents,commands,rules}` (hilang di paket npm/checkout Windows).
- `lumitome update` pada instalasi npm menampilkan perintah npm. `upgrade-engine` memakai unduh+verifikasi yang sama (zip Windows/macOS, tar.gz Linux).
- Tes regresi: port service vs listener di 49374 (unit + e2e engine asli `service start`), path Windows, SHA256 salah ditolak, paket npm.

## 0.3.2 — Rules inti + `lumitome update`

- Rules inti Lumitome (`lumitome/rules/00-core.md`, `01-safety.md`, ±0.8k token): sintesis Karpathy, superpowers, poteto, grokbot-field-notes, Canny, dll (atribusi + SHA di docs/RULES.md). Selaras auto-mode: asumsi dicatat, tanya hanya untuk risiko merusak.
- FIX: rules, agents, dan commands sebelumnya tidak termuat di bawah wrapper (config proyek mati, config Lumitome tanpa `instructions`). Kini dimuat dari config dir Lumitome (`$LUMI_HOME/config/{rules,agents,commands}`) di proyek mana pun.
- BARU `lumitome update [--check] [--to vX.Y.Z] [--sha <commit>] [--yes] [--rollback]`: tag rilis terbaru dari origin. Alurnya: clone tag → verifikasi commit = sha tag dan VERSION = tag → swap atomik dengan backup → cek pasca-pasang → rollback otomatis bila gagal. Engine OpenCode tidak disentuh dan tidak ada auto-update.
- Onboarding provider:
  - `lumitome` (TUI) kini terbuka tanpa env/provider. Tanpa provider muncul prompt: `c` → wizard, Enter → TUI (`/connect` bawaan OpenCode).
  - `lumitome connect`: Custom OpenAI-compatible / Anthropic-compatible, boleh banyak provider. Model dideteksi otomatis (GET /models; Anthropic memakai x-api-key + anthropic-version + paginasi) dan muncul di `/model`.
  - Perintah kelola: `--list`, `--remove`, `lumitome models --refresh`.
  - Key disimpan di `$LUMI_HOME/credentials.json` 0600, masuk config hanya sebagai `{env:LUMI_KEY_*}`, tidak pernah dicetak; guard menolak `*LUMI_KEY_*`.
  - `run` tanpa provider → exit 2 dengan pesan jelas.
- Agent orchestrator/sektor tidak lagi merujuk `scripts/skill-query.mjs` (path repo). Skill dipilih router Lumitome sebelum run; MCP `skill_search` (`skills-<sektor>`) didaftarkan wrapper dengan path absolut instalasi, sehingga tersedia di proyek mana pun.
- README (brand kit tetap): Quickstart install → `lumitome` → `lumitome connect`, bagian Updating.
- Wrapper memblok `upgrade`/`update`/`uninstall` milik engine OpenCode (engine terpin).
- Pengguna v0.3.1 (belum punya `lumitome update`): jalankan ulang one-liner installer sekali; installer menarik main terbaru ke `~/.lumitome/src`.

## 0.3.1 — Router skill L0-first

- Pengayaan 86 skill aktif: alias id+en terkurasi (`router/skills-aliases.json`), sinonim dwibahasa & 3–5 contoh permintaan per skill dibangkitkan otomatis saat indeks (`router/enrich.mjs`; dump: `node scripts/skill-enrich.mjs`).
- Retrieval L0 baru (`router/l0.mjs`): FTS5 BM25 unicode61 (nama/alias/sinonim/contoh/short/deskripsi) + koreksi typo trigram + daftar kemiripan trigram + hint Layer-0 → RRF.
- L1 kini cadangan: hanya saat confidence rendah (margin BM25 < 0.15 / tanpa hit), timeout keras 3 s → L0, kandidat top-8 L0. `LUMI_ROUTER_L1=auto` default.
- Cache pilihan per query ternormalisasi di `$LUMI_HOME/router-cache.json` (TTL 7 hari, invalid saat katalog berubah).
- Eval v2 (`tests/router-eval-v2.json`, dev/test, ditulis sebelum tuning) + `tests/router-eval2.mjs`.

## 0.3.0 — Lumitome (repo mandiri)
- Rebrand ke **Lumitome**; installer `fahmi0812/Lumitome`, `LUMI_HOME=~/.lumitome`, launcher `~/.local/bin/lumitome`, `install.sh --uninstall`.
- Engine OpenCode v2.2.4 terpin + SHA256, terisolasi (XDG_* sendiri), autoupdate mati, `lumitome engine` / `upgrade-engine`.
- Proyek untrusted by default (`LUMI_TRUST_PROJECT=1` opt-in); serve password 0600 tanpa cetak.
- Fail-fast provider (preflight, watchdog 90 s, deadline 5 menit, kill eskalasi).
- 4 skill finance dasar; router fallback top-3, L1 cache/compact (opt-in); permintaan trading tanpa skill.
- Guard: daftar nama `.env*` boleh; anti-spin per-signature; done-gate mendeteksi exit tes yang disamarkan.


## 0.1.6 — 2026-10-31 — Arsitektur final (disetujui Fahmi)
Basis v0.1.5 (backup `pkg.bak-0.1.5`). OpenCode **v2.2.4**. Skill aktif tetap **82**; api-security & llm-security tetap nonaktif. Riset acuan: `swanwright-research/REPORT.md`, `MCP-REPORT.md`.

### Skill Query Layer (desain v0.2 fase 1)
- `router/skill-db.mjs` (tanpa dependensi wajib; `node:sqlite`): tabel `skill`, `skill_fts` (FTS5 BM25), `skill_vec` (sqlite-vec 0.1.9, optionalDependency, hanya bila ada embedding), `agent_policy`, `allowed_skill`, `skill_edge`, `route_log`, `meta`.
- Filter SQL sektor/pack/status/izin SEBELUM ranking → query ganda → BM25 (+vec) → RRF k=60 → dedup (61 duplikat pack) → top-24 (16–32) → 1 panggilan 9router pilih-saja (≤5, JSON tervalidasi) → fallback deterministik bila 9router mati → `route_log`.
- `scripts/skill-index.mjs --if-changed|--check` (rebuild saat hash berubah), `scripts/skill-query.mjs`, `scripts/skill-metrics.mjs` (recall@k, top-1, MRR, zero-load, latensi).
- `router/skill-search-mcp.mjs`: MCP stdio read-only `skill_search`, satu server per sektor (`skills-<sektor>`).
- `router/layer1-select.md`: prompt pilih-saja. Layer-0 tidak diubah (golden 154, 0 mismatch).

### MCP per sektor
- `router/mcp-sectors.json` + `scripts/gen-policy.mjs` → frontmatter `permissions` 10 agent: `*_*` deny → `external_directory` ask → allow server sektor sendiri; `codemem_delete_project`/`manage_adr` = ask; tool tulis github = ask; skill: deny `*` lalu allow allowlist sektor.
- Server: context7 4.4.4, codemem (codebase-memory-mcp v0.12.1, didaftarkan manual), playwright-mcp 0.0.83, chrome-devtools-mcp 1.12.0, markitdown-mcp 0.0.1a8 (aktif); figma remote (OAuth) & github remote (token env) **mati**; `gw-<sektor>` gateway opsional **mati** (template Docker MCP Gateway & ContextForge di `config/mcp-gateway/`). Tanpa Kali, tanpa trading.
- Global: deny `codebase-memory-mcp install|update`; plugin juga memblok. Provider 9router sekarang `{env:SW_9ROUTER_URL}`/`{env:SW_9ROUTER_KEY}`.
- `checkMcpPolicy` di validate: token literal, `@latest`, paket tak dipin, figma/github/gateway enabled, server terlarang, Code Mode dimatikan → FAIL.

### Pemasangan
- `install.sh` (Linux/macOS/WSL2; Windows native ditolak dengan instruksi WSL): OpenCode v2.2.4, Node 22.23.4, codebase-memory-mcp v0.12.1, uv 0.13.6 — SHA256 terpin + file checksum rilis; `~/.swanwright/{bin,env.sh,secrets.env(600)}`; `npm ci`; bangun indeks; idempoten; tidak menulis `~/.config/opencode`.
- `scripts/doctor.sh` (`bash install.sh --doctor`): skill=82, MCP connected, plugin active, agents, skill_search, 9router. `scripts/e2e-opencode-v2.sh` kini memanggil doctor.

### Dokumen
- `ARCHITECTURE.md` (root, final) + `docs/diagrams/{arsitektur,orchestrator}-final.{mmd,png}`, `docs/MCP.md`, `docs/MCP-GATEWAY.md`, `docs/VERIFY-OPENCODE.md` (output mentah v0.1.6).
- Tes 59 → 83.

### Isu diketahui
- Layer-1 nyata (9router) & embedding semantik belum diuji: 9router tidak hidup di box. Metrik = retrieval tanpa L1.
- Gateway (Docker/ContextForge) belum diuji (tanpa Docker di box); endpoint `/mcp` & token = [VERIFIKASI].
- figma/github tidak diuji (butuh OAuth/token).

## 0.1.5 — 2026-10-31
### Migrasi ke OpenCode v2 (disetujui Fahmi)
Diuji pada **OpenCode v2.2.4** (rilis GitHub anomalyco/opencode `v2.2.4`, 2026-10-30 23:59 WIB; tarball `opencode-linux-x64.tar.gz`, SHA256 cocok `SHA256SUMS`). Catatan: npm `opencode-ai@latest` masih 1.19.5; paket v2 = `@opencode/cli` / `@opencode/plugin` 2.2.4.

Sumber: https://opencode.ai/v2/docs/migrate-v1/ , https://opencode.ai/v2/docs/build/plugins/migrate-v1/ , https://opencode.ai/v2/docs/skills/ , /v2/docs/permissions/ , /v2/docs/mcp-servers/ , /v2/docs/agents/ , /v2/docs/plugins/ .

Breaking change v2 yang berdampak ke Swanwright:
- **Plugin API** (breaking resmi): plugin V1 (`export const X = async () => ({"tool.execute.before": …})`) tidak jalan di v2. → `swanwright.ts` kini `export default` `{ id: "swanwright", setup(ctx) { ctx.tool.hook("execute.before", guardPushMain) } }`; event `{tool, input}`; nama tool `shell` (alias `bash` tetap dicek).
- **Permissions**: map `permission` → array berurutan `permissions: [{action, resource, effect}]`; `bash`→`shell`, `task`→`subagent`, `write/patch`→`edit`. `external_directory` default v2 = allow → Swanwright set eksplisit `ask`. Tambahan deny `shell git push *main*|*master*`.
- **Agents**: frontmatter `permission` → `permissions` (orchestrator: deny edit `task_plan.md`/`findings.md`, allow `subagent *`).
- **MCP**: server pindah ke `mcp.servers.<nama>`, `enabled` → `disabled`, `timeout: {catalog, execution}`.
- **Providers**: `provider/npm/options` → `providers/package: "aisdk:@ai-sdk/openai-compatible"/settings` (9router tetap satu-satunya provider).
- Skills: lokasi `.opencode/skills/<id>/SKILL.md` tetap; v2 memakai nama folder sebagai id (aturan nama=folder dipertahankan sebagai lint).
- Lokasi config tidak berubah; skema `https://opencode.ai/config.json` gabungan V1+V2 (field V1 `deprecated`). `tui.json`→`cli.json` tidak dipakai Swanwright.

Perubahan lain:
- `scripts/check-opencode.mjs`: `checkV2Config` (tolak kunci V1 `permission/agent/mode/provider/plugin/command/tools`, `mcp.<nama>` langsung, `enabled`), agents tolak `permission/tools/prompt`, plugin wajib `export default` + `id` + `setup`.
- `scripts/e2e-opencode-v2.sh`: E2E nyata via `opencode serve` + HTTP API (`/api/skill`, `/api/mcp`, `/api/plugin`).
- Tes 54 → 59. Skill aktif tetap **82** (tidak dipotong/ditambah); api-security & llm-security tetap nonaktif. Rules, done-gate, scan-gate, routing (golden 154, 0 mismatch) tidak berubah.

### Isu diketahui
- `opencode mcp list` / `opencode plugin list` (CLI v2.2.4) mencetak "No MCP servers configured" / "No plugins found" untuk config proyek, padahal API server untuk direktori yang sama melaporkan context7 `connected` & plugin `active`. Verifikasi pakai API.
- Hook push-main di-tes unit (mock `ctx.tool.hook`); belum dipicu lewat sesi model nyata (butuh 9router hidup).

## 0.1.4 — 2026-10-31
### Dipulihkan (disetujui Fahmi)
- Catatan koreksi: v0.1.1 memangkas skill aktif 83 → 48 **tanpa persetujuan Fahmi** (demi target token indeks). v0.1.4 memulihkan cakupan: 34 skill dipindah dari pack ke `.opencode/skills` → **82 aktif** (target 84; 2 ditolak, lihat bawah).
- coding (workflow): brainstorming, code-review, requesting-code-review, receiving-code-review, finishing-a-development-branch, dispatching-parallel-agents, git-guardrails-claude-code, improve-codebase-architecture, correct, reflect, poteto-mode, in-your-own-words, react, next, skill-creator.
- coding (design UI): design-taste-frontend, emil-design-eng, hallmark, magic-ui, gsap-core, gsap-scrolltrigger.
- security: code-audit (SAST defensif).
- riset: research, figure-it-out, interrogate. penulisan: doc-coauthoring, laporan-generator, internal-comms, technical-writer. media: motion-design, video-demo, sound-design, web-sims, review-loop.
### Tidak diaktifkan
- `api-security`, `llm-security` (zhaoxuya520/reverse-skill): ofensif — langkah serangan aktif (JWT alg:none, brute force, bypass rate-limit/DoS; payload prompt-injection, "simulasi serangan red team", cari teknik eksploit terbaru) dan instruksi "langsung eksekusi, jangan berhenti di konfirmasi". Tetap di pack `red-team` (butuh consent+scope).
### Routing
- Registry: entri baru dengan champion/fallback, trigger spesifik, deskripsi ringkas Indonesia, `activated_in`, `from_pack`. Indeks dikelompokkan per sektor (~1.470 token).
- Layer-0: 16 rule baru (media/penulisan/riset/security/coding) + skillsHint. GSAP di-route ke executor `media` agar golden lama `media-05/10/15/20` tetap benar; skill gsap-* tetap tercatat sektor coding.
- Golden 134 → 154 (20 kasus `v014-*` dengan `expect_skill`); tes strict: 0 mismatch + semua skill baru ter-route. Tes 52 → 54.
- Docs: sektor finance belum punya skill (tanpa sumber).

## 0.1.3 — 2026-10-31
### Diperbaiki (BUG: tidak ada skill/MCP yang dimuat OpenCode)
- 611 folder skill (aktif + pack) diganti nama = frontmatter `name`, valid regex OpenCode; bentrok diberi sufiks unik; frontmatter dinormalisasi (YAML valid, deskripsi 1–1024). Provenance di registry (`original_id`, `original_name`, `src`, `sha`), katalog, NOTICE, `metadata` frontmatter.
- `opencode.jsonc` mengikuti skema resmi: `mcp.<nama>.{type:"local", command:[...]}`; hapus `mcp.timeout`/`mcp.servers`; hapus `plugin: file://folder`; tambah `instructions` (rules 00–05), `default_agent: orchestrator`, `provider.9router.models`, izin bash deny `git push*main*`.
- Plugin dipindah ke `.opencode/plugins/swanwright.ts` (format resmi `export const X: Plugin = async () => hooks`, hook `tool.execute.before`), hanya import tipe `@opencode-ai/plugin`.
- Orchestrator: `permissions` (tak dikenal) → `permission`. Hapus folder sampah `.opencode/agents/{sectors}`.
### Ditambahkan
- `scripts/check-opencode.mjs` + validate: FAIL bila folder≠name, regex/panjang tidak valid, YAML frontmatter rusak, nama duplikat, config gagal skema https://opencode.ai/config.json (ajv 8.20.0, snapshot skema di `scripts/schema/`), agent/plugin tidak valid.
- `scripts/enable-pack.mjs`: salin pack ke `.opencode/skills` + validasi; `--disable` untuk mencabut.
- Verifikasi E2E nyata dengan OpenCode 1.19.5: `docs/VERIFY-OPENCODE.md` (48 skill, context7 connected, plugin dimuat, agent tampil).
- Tes 42 → 52. devDependencies: ajv 8.20.0, yaml 2.9.1. `@opencode-ai/plugin` 1.19.5 sengaja TIDAK dipasang: hanya import tipe (dihapus saat strip-types), dan dependensi transitifnya (toml 4.3.0 via effect, zod 4.1.8) kena CVE HIGH ber-fix per osv-scanner 2026-10-31.

## 0.1.2 — 2026-10-30
### Diperbaiki
- Layer0: 8 mismatch golden (riset-02/04/07/09/12/14/17/19) → 0. Penyebab: regex penulisan `\bpaper\b` terlalu luas sehingga "cari sumber paper"/"rangkum paper" masuk penulisan. Tambah rule riset (cari/rangkum/ringkas/survei/telaah/bandingkan + ≤3 kata + paper/jurnal/literatur) sebelum rule penulisan. Ekspektasi golden tidak diubah (sudah benar: mencari/merangkum paper = riset).
### Ditambahkan
- Tes strict: golden layer0 harus 0 mismatch; tes "tulis paper" tetap penulisan, "rangkum paper" → riset. Total 42 tes.

## 0.1.1 — 2026-10-30
### Ditambahkan
- Rule sektor coding `.opencode/rules/06-coding-karpathy.md` (≤150 token): kode minimal, perubahan bedah, asumsi headless sebagai `JUDGMENT:`, verifikasi via done-gate. Sumber multica-ai/andrej-karpathy-skills @2c606141936f1eeef17fa3043a72095b4765b9c2 (MIT).
- `harness/scan-gate.ts` + `npm run scan`: osv-scanner v2.7.0 (lockfile/manifest) dan gitleaks v8.30.1 (diff+staging). FAIL untuk CVE CRITICAL/HIGH ber-fix atau secret; MEDIUM ke bawah WARN; biner hilang UNRUN + instruksi instalasi.
- Done-gate: `sector`, `scanGate`, `changedFiles`, `taskScope`; diff-scope di luar scope → WARN (bukan blok); `warnings[]` di hasil.
- Allowlist `osv-scanner.toml` dan `.gitleaks.toml` (wajib reason/description, dicek validate). `docs/SCAN-GATE.md`.
- Layer0: kata kunci Karpathy → sektor coding + rule 06. 4 golden case baru (134 total).
- Tes: 7 → 40 (rule coding, scan PASS/FAIL/UNRUN/WARN via mock+fixture, diff-scope WARN, golden tanpa regresi, doc-code drift).
- Rule global Doc-Code Drift `.opencode/rules/00-doc-code-drift.md` (kalimat verbatim dari arXiv:2610.30571): prioritas user > kode/tes > dokumen; rule keamanan tak bisa ditimpa; drift dilaporkan sebagai FACT di bagian "Doc-Code Drift"; dimuat orchestrator + sektor coding/security (finance/media bila menyentuh kode). Catatan "bisa basi" di AGENTS.md dan rules/01.
- `harness/doc-drift.ts`: deteksi drift deterministik (print/logging, os.path/pathlib, dst.) dengan file:baris; WARN bila kode lulus tes ditulis ulang demi dokumen. `docs/DOC-CODE-DRIFT.md`.
### Diubah
- `karpathy-guidelines` → pack `coding-extra` (champion false, tetap di-vendor, atribusi tetap).
- 35 skill aktif → pack (duplikat impeccable/ui-ux-pro-max, skill jarang). Aktif 83 → 48.
- Deskripsi indeks dipersingkat (Bahasa Indonesia). Indeks aktif ~2.847 → ~1.054 token.
- osv-scanner: hasil di `packs/` dan `.opencode/skills/` (skill vendored) dilewati; `.gitleaks.toml` mengecualikan `packs/red-team/` (payload contoh vendored) dengan alasan.
- Validate: cek path skill pack, indeks vs registry, token rule 06, allowlist beralasan.

## 0.1.0
- Rilis awal.
