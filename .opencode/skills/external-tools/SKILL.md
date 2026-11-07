---
name: external-tools
description: 'Pasang aplikasi eksternal dan hubungkan ke agent: triage MCP/CLI/API, install per OS (Linux/Windows/macOS) tanpa sudo, daftarkan MCP ke Lumitome, verifikasi. Use for pasang/install external tools, hubungkan aplikasi ke agent, tambah MCP server, integrasi Figcraft atau tool eksternal lain.'
license: MIT
metadata:
  swanwright_sector: coding
  swanwright_src: fahmi0812/Lumitome
  swanwright_sha: 7bb93b989d5f965e60db2f7c4ef8a9988f43f81a
  swanwright_original_id: lumitome__external-tools
  swanwright_original_name: external-tools
---

# External Tools: pasang aplikasi eksternal, hubungkan ke agent

Satu prosedur untuk semua tool eksternal: kenali dulu permukaan integrasinya, baru install, baru daftarkan. Jangan melompat ke install sebelum triage — tool yang cuma bisa GUI tidak akan bisa di-remote, seberapa pun bagus installernya.

## Batas yang jujur — baca dulu

- **Agent tidak bisa sudo.** Install system-wide (`.deb`, `.msi` admin, `apt install`) adalah urusan manusia. Agent hanya install di user-space: AppImage, portable `.zip`/`.tar.gz`, `npx`/`uvx` terpin, atau binari di folder proyek.
- **Agent tidak bisa menulis di luar workspace** (tier standard). Symlink ke `~/.local/bin`, edit config di `~/.lumitome`, dan daftar MCP adalah langkah yang agent *siapkan*, manusia/CLI yang *terapkan*. Tulis perintahnya persis, jangan pura-pura sudah diterapkan.
- **MCP tidak aktif sendiri.** Server baru harus didaftarkan (`router/mcp-sectors.json` + `gen-policy` + `LUMI_MCP` + restart service) dan mati default sampai di-opt-in. Skill ini menyiapkan pendaftarannya; bukan sulap.
- **Aplikasi GUI butuh layar.** Di tier strict (bwrap) aplikasi GUI tidak tampil karena display tidak diteruskan. Install + jalan itu urusan tier standard/trusted, di mesin yang punya layar.
- **Tidak ada daemon baru.** Tool yang butuh proses latar yang selalu jalan adalah penolakan — kecuali user minta eksplisit. Prefer stdio (jalan saat dipanggil, mati setelahnya).

## Langkah 0 — Cek dulu (jangan install ulang yang sudah ada)

```sh
command -v <binari> && <binari> --version
```

Sudah ada + versi cocok → lompat ke Langkah 3. Belum ada → lanjut. Selalu cek dulu: download ulang itu buang bandwidth, waktu, dan disk.

## Langkah 1 — Triage permukaan integrasi

Cari di repo/dokumentasi resmi tool itu, dalam urutan ini. Berhenti di yang pertama ketemu:

| Permukaan | Tanda | Artinya buat agent |
|---|---|---|
| MCP stdio | ada server MCP (`crates/mcp`, `mcp-server`, `mcp add`, `.mcp.json`) | Bisa di-remote penuh. Lanjut Langkah 2–4. |
| MCP remote | URL `https://.../mcp`, butuh OAuth/token | Bisa, tapi auth di tangan user (`{env:}` atau `opencode mcp auth`). |
| CLI | ada binari/CLI (`--help`, subcommand) | Bisa lewat shell. Bungkus pemanggilan umum jadi pola di skill/tool itu. |
| HTTP API | OpenAPI/REST, API key | Bisa lewat `curl`/script. Key hanya via `{env:}`. |
| File saja | format file terbuka (`.drawio`, `.md`, `.json`) | Agent hanya hasilkan/olah file. Tool-nya dibuka user. |
| GUI saja | tidak ada satupun di atas | Tidak bisa di-remote. Skill hanya hasilkan artefak (contoh: `stitch-ui` → design.md + prompt). |

Catat hasilnya dalam satu baris sebelum lanjut: "`<tool>`: MCP stdio via `<perintah>`, vX.Y.Z" atau "`<tool>`: GUI saja, artifact-only". Kalau ragu antara dua baris, pilih yang lebih lemah (lebih jujur) — klaim MCP yang ternyata tidak ada lebih mahal daripada artifact-only yang ternyata bisa lebih.

## Langkah 2 — Install per OS

Pilih satu baris per OS. Urutan = preferensi (paling ringan, tanpa sudo, dulu):

| OS | Pilihan 1 (tanpa sudo) | Pilihan 2 (oleh user) |
|---|---|---|
| Linux | AppImage (jadikan executable) / portable `.tar.gz` diekstrak ke folder proyek atau `~/.local/bin` | `.deb` / `.rpm` / Flatpak |
| Windows | portable `.zip` / `winget install --id <id>` (user-space bila bisa) | `.msi` / `.exe` installer |
| macOS | `brew install --cask <nama>` (user) / portable `.zip` | `.dmg` installer |

Aturan install:

- **Pin versi.** Selalu `vX.Y.Z` eksplisit, jangan `@latest`, jangan `main`. Cocokkan dengan yang didaftarkan di Langkah 3.
- **Verifikasi checksum.** Unduh `SHA256SUMS` dari rilis resmi, cocokkan hash binari sebelum menjalankan. Hash tidak cocok → berhenti, jangan lanjut.
- **Verifikasi jalan.** `<binari> --version` harus mencetak versi yang dipin. Gagal → instalasi belum selesai, jangan lanjut ke Langkah 3.
- **Jangan `curl|bash` tanpa verifikasi.** Installer script harus dibaca dulu (apa yang diunduh, ke mana ditulis) atau dilewati demi artefak rilis resmi.
- **Satu binari, bukan SDK.** Kalau tool itu punya binari rilis, pakai itu. Jangan `cargo build`/`npm install -g` dari source kecuali tidak ada artefak rilis — build dari source itu lambat, berat, dan tidak deterministik.

## Langkah 3 — Daftarkan ke Lumitome

### MCP server baru

1. Tambah entri di `router/mcp-sectors.json`: `{ "kind": "direct", "default": "disabled", "risk": "S", "src": "<repo>", "pin": "vX.Y.Z", "needs": "<binari + opt-in>" }`, lalu masukkan namanya ke daftar `sectors` yang relevan (misal `media`).
2. Tambah blok opt-in di `lumitome/bin/lumitome.mjs` mengikuti pola `drawio`: hanya bila `LUMI_MCP` menyebut nama itu eksplisit, **tidak ikut `all`**. Perintah = binari absolut atau `figcraft-cli` di PATH; beri `timeout` startup/catalog 30 detik, execution 300 detik. Untuk server yang bisa menyentuh file (misal Figcraft), teruskan batas folder workspace sebagai flag confinement-nya bila tersedia — jangan biarkan MCP server menulis di luar workspace.
3. Tambah baris di tabel `docs/MCP.md`.
4. Jalankan `npm run policy`, lalu `npm run validate` dan `npm test`. Policy harus hijau sebelum commit.
5. Nyalakan dengan `LUMI_MCP=<default>,<nama>` lalu restart service (`lumitome service stop` — service lama dimatikan, yang baru naik dengan config baru).

### CLI / API (tanpa MCP)

- CLI: binari harus di PATH atau dirujuk path absolut di instruksi skill. Kalau butuh symlink ke `~/.local/bin`, tulis perintahnya untuk user — agent tidak bisa menulis ke sana.
- API: secret hanya via `{env:NAMA}` di config; nilai di `~/.lumitome/secrets.env` (0600, di luar repo). Jangan pernah tulis token literal di skill, config, atau contoh.

## Langkah 4 — Verifikasi (done-gate, bukan "katanya jalan")

1. Tool muncul di daftar MCP agent (`figcraft_*` atau sejenisnya) — bukan sekadar config tertulis.
2. Satu panggilan tes yang membuktikan jalan (bukan `--help`): buat sesuatu yang kecil, baca balik hasilnya, lalu hapus/abaikan.
3. Catat di jurnal: tool, versi terpin, cara install, cara nyalakan. Kalau verifikasi gagal, laporkan langkah mana yang gagal — jangan klaim "terintegrasi" tanpa bukti panggilan.

## Contoh kerja: Figcraft

Sumber kebenaran: `docs/mcp.md` di `storytold/figcraft` (4.328 baris — jangan disalin ke sini; baca bila butuh daftar tool lengkap). Ringkasnya:

- **Triage:** MCP stdio first-party (`crates/mcp`, `figcraft-mcp`). Bukan artifact-only.
- **Install (Linux):** rilis v0.16.0 → `FigCraft.AppImage` (jadikan executable). CLI-nya terbungkus di AppImage: `FigCraft.AppImage cli <args>` sama dengan `figcraft-cli <args>`. Windows: portable `.zip` (`.msi` oleh user). Verifikasi: `FigCraft.AppImage cli --version` (atau `figcraft-cli --version` bila di PATH).
- **Dua mode MCP:**
  - Headless: `figcraft-cli mcp` — engine di dalam proses, satu dokumen kosong, tanpa jendela, renderer CPU. Untuk kerja batch.
  - Attach: jalankan aplikasi dengan `figcraft --control 7979`, lalu `figcraft-cli mcp --attach 7979` — user melihat tiap perubahan langsung di kanvas (avatar agent muncul di baris orang, outline di layer yang diubah). Untuk kerja yang mau ditonton.
- **Confinement (wajib):** headless pakai `--automation-read-root <dir> --automation-write-root <dir>` — di Lumitome, isi keduanya dengan folder sesi (workspace). Tanpa flag, server tidak terkurung dan bisa menyentuh file di luar workspace. Mode attach tidak menerima flag ini — kurung dari sisi aplikasi (`figcraft --control 7979 --automation-read-root DIR --automation-write-root DIR`).
- **Konvensi yang harus diingat:** koordinat = page unit (1 unit = 1 px pada zoom 100%), x ke kanan, y ke bawah; `create_node`/`set_properties` pakai x/y relatif terhadap parent frame; anak auto-layout diatur lewat `layout`/`gap`/`padding`/`mainAlign`/`crossAlign`/`sizingH`/`sizingV`, bukan x/y.
- **Daftarkan:** entri `figcraft` di `mcp-sectors.json` (media, disabled, pin v0.16.0) + blok opt-in di `lumitome.mjs` + baris `docs/MCP.md` + `npm run policy`. Nyalakan: `LUMI_MCP=<default>,figcraft`, restart service.
- **Pendaftaran sudah ada di repo** (sejak v0.3.20) — yang tersisa buat user baru: install AppImage/CLI-nya, lalu nyalakan via `LUMI_MCP`.

## Efisiensi — aturan yang tidak boleh dilanggar

- Cek dulu sebelum install; pin versi; satu binari, bukan SDK; stdio, bukan daemon; mati default, nyala hanya saat opt-in.
- Skill ini hanya Markdown — tanpa script, tanpa dependensi baru, tanpa proses latar. Jangan tambah ketiganya tanpa alasan yang tertulis di sini.
- Jangan salin dokumentasi upstream ke skill ini. Ringkas + beri tautan. Dokumentasi 4.000 baris di dalam skill adalah bottleneck yang kamu minta dihindari.

## Delegasi — jangan mengajari ulang

- Membangun server MCP baru dari nol → skill `mcp-builder` (bukan skill ini).
- Mendesain tool CLI/MCP → skill `rea-tool-design`.
- Membuat skill baru → skill `skill-creator`.
- Tabel server MCP Lumitome → `docs/MCP.md`; pemetaan sektor → `router/mcp-sectors.json`.

## Guardrails

- MCP tidak dipakai sebelum di-scan dan di-pin versinya. Tanpa Kali, tanpa trading. Tool destruktif = `ask`.
- Rahasia hanya via `{env:}`. Token literal di skill/config/contoh = gagal `validate`.
- Jangan daftarkan server yang butuh `sudo`, daemon always-on, atau akses jaringan tanpa batas — kecuali user minta eksplisit dan risikonya ditulis.
