---
name: stitch-ui
description: 'Buat UI dari gambar referensi: audit screenshot jadi design.md + Stitch prompt + index.html, lalu prompting modular di Google Stitch. Use for Stitch UI generation, design.md extraction, UI prototype from a screenshot. Stitch/Gems/Vcraft are external tools — this skill only produces the artifacts.'
license: MIT
metadata:
  swanwright_sector: coding
  swanwright_src: fahmi0812/Lumitome
  swanwright_sha: c544afabb5eb88a0e9b5e050353a06bbb0ccc769
  swanwright_original_id: lumitome__stitch-ui
  swanwright_original_name: stitch-ui
---

# Stitch UI: dari gambar referensi ke UI di Google Stitch

Bangun antarmuka dari sebuah gambar referensi (screenshot dashboard, landing
page, aplikasi) lewat alur 6 langkah: fondasi → PRD → audit gambar →
prototipe → prompting modular di Stitch → (opsional) migrasi ke Vcraft.

Provenance: disintesis dari "Panduan Lengkap Perancangan UI dengan Stitch
dan AI" — rangkuman tutorial video 01–09 berbahasa Indonesia yang disediakan
pengguna (materi pengguna, bukan repo publik). Isi disusun ulang dengan kata
sendiri; nama tool dan langkah alurnya dipertahankan karena itulah yang
diajarkan tutorialnya.

## Batas yang jujur — baca dulu

**Lumitome tidak bisa menjalankan Google Stitch, Gemini Gems, atau Vcraft.**
Tidak ada API Stitch, tidak ada MCP Stitch/Gems/Vcraft di Lumitome, dan
tidak ada yang ter-scan atau ter-pin. Skill ini **hanya menghasilkan tiga
artefak** yang bisa dibuat di sini:

1. `design.md` — spesifikasi token dan komponen dari gambar referensi.
2. Stitch prompt — teks prompt siap tempel ke Google Stitch (browser).
3. `index.html` — prototipe statis yang bisa dibuka di browser lokal.

Pengguna yang membuka Stitch, Gems, atau Vcraft di browsernya sendiri dan
menempelkan artefak itu di sana. Jangan pernah mengklaim ada koneksi,
API, MCP, atau integrasi otomatis ke tool-tool tersebut. Jangan
mengarang URL, harga, atau fitur Stitch/Gems/Vcraft — bila pengguna
bertanya, katakan yang tidak bisa diverifikasi dari sini.

Padanan Gemini Gems di Lumitome adalah skill ini sendiri + slash
`/stitch-ui`: alurnya sudah dibakukan di sini, jadi tidak perlu mengetik
ulang prompt panjang di tiap proyek.

## Alur 6 langkah

### Langkah 1 — Fondasi: token + atomic design

Jangan lompat langsung ke tata letak halaman penuh. Susun dulu:

- **Foundation (token desain):** palet warna, skala tipografi, aturan spasi,
  elevasi/shadow, radius sudut. Ini acuan mutlak saat slicing ke front-end.
- **Atomic design:** Atom (tombol, input, label, ikon) → Molekul (search bar
  = input + ikon + tombol) → Organism (navbar, header, card produk).
- **Design system:** fondasi + komponen atomic dalam satu pustaka terpusat.

Prinsip handover: perubahan variabel global di foundation langsung tercermin
ke seluruh halaman karena hierarkinya berjenjang. Bila pengguna sudah punya
PRD + `DESIGN_SYSTEM.md` dari skill `docs-pack`, pakai itu sebagai fondasi
dan jangan buat token baru yang bertabrakan.

### Langkah 2 — PRD sebagai prasyarat

UI tanpa PRD akan acak. Sebelum audit gambar, pastikan ada PRD: daftar fitur,
hierarki kebutuhan pengguna, batasan teknis. Bila belum ada, buat dengan
skill `docs-pack` (PRD dulu, baru yang lain) atau dari catatan fitur mentah
pengguna yang disusun ke struktur PRD baku. PRD yang matang mencegah scope
creep dan memberi konteks saat memecah tugas desain di langkah 5.

### Langkah 3 — Audit gambar referensi → 3 artefak

Pengguna menempelkan/mengunggah gambar referensi (mis. screenshot dashboard).
Audit visualnya dan hasilkan ketiganya:

1. **Stitch prompt** — prompt terstruktur untuk Google Stitch (lihat
   `references/stitch-prompt-template.md`).
2. **`design.md`** — spesifikasi lengkap: token warna, rasio ukuran, grid,
   komponen (lihat `references/design-md-template.md`).
3. **`index.html`** — prototipe statis yang rapi, bisa langsung dibuka di
   browser lokal.

Aturan audit:

- Ekstrak hanya yang benar-benar terlihat di gambar; jangan mengarang warna,
  font, atau komponen yang tidak ada. Bila ragu, tulis `[tidak jelas di
  gambar — konfirmasi pengguna]`.
- Ganti tipografi bawaan yang generik: hasil yang memakai font default
  terlihat seperti AI-slop. Pilih pasangan font yang punya karakter
  (delegasi ke `design-taste-frontend` bila perlu).
- Sebutkan inkonsistensi yang terlihat (mis. dua ukuran tombol berbeda
  untuk fungsi yang sama) dan usulkan satu token untuk masing-masing.
- Simpan artefak di folder kerja pengguna (mis. `design/design.md`,
  `design/stitch-prompt.md`, `design/index.html`), bukan di repo Lumitome.

### Konsultasi modern-web-guidance (MWG) sebelum menulis `index.html`

Pola yang terlihat di gambar referensi belum tentu pola modern — gambar
bisa saja memakai pola legacy. Untuk tiap komponen di gambar (progress,
form, navigasi, dsb.), konsultasi modern-web-guidance (GoogleChrome —
panduan web modern + status Baseline + strategi fallback) mengikuti
4 langkah yang sama seperti `loopdesign` §1: **search**
(`node harness/mwg-consult.mjs search "<kemampuan 2–5 kata>"`) →
**retrieve** (`retrieve <id[,id...]>` atau `consult "<query>"`) →
terapkan ke `index.html` dan **verifikasi** terhadap panduan →
**disclose** di `design.md` (seksi `### Modern Web Guidance`: ID + nama
panduan yang dipakai dan jebakan yang dihindari). Fallback offline =
lanjut tanpa MWG (catat `source: "fallback"` di seksi disclose);
jangan panggil `npx` langsung — helper menjalankan persis
`npx -y modern-web-guidance@latest ...` (dengan `-y`, tanpa prompt).
Tidak ada file MWG yang diimpor ke repo. Prompt Stitch sendiri tidak
mengutip MWG — disclose hanya di `design.md`.

### Langkah 4 — Motion dari HTML statis

`index.html` dari langkah 3 bisa ditingkatkan jadi materi pitching: animasi
dan simulasi interaktif (transisi kontainer, interaksi mikro, simulasi
spacing untuk menganalisis masalah jarak). Kualitas motion berbanding lurus
dengan kerapian HTML awal — struktur DOM yang rapi menghasilkan motion yang
presisi. Delegasi pengerjaan motion ke `motion-design` dan `web-sims`;
skill ini hanya menentukan *apa* yang dianimasikan dan kenapa (mis. "simulasikan
spacing antar card untuk memeriksa hierarki visual").

### Langkah 5 — Prompting modular di Google Stitch

Dua prasyarat wajib sebelum membuka Stitch: **PRD** (langkah 2) dan
**`design.md`** (langkah 3). Masukkan `design.md` ke Stitch sebagai pedoman
visual global, lalu **jangan** memasukkan seluruh PRD sekaligus dalam satu
prompt panjang. Pecah PRD jadi prompt modular per komponen, dalam urutan
ini, satu per satu:

1. **Navigasi + header** — tempel prompt spesifikasi nav/header ke Stitch.
2. **Konten utama** — prompt main grid / card list.
3. **Pendukung + footer** — prompt elemen pendukung dan footer.

Kunci konsistensi: walau prompt diinput bertahap, hasilnya tetap selaras
karena semua bagian diikat token yang sama di `design.md`. Bila satu
bagian melenceng dari token, perbaiki `design.md`-nya dulu, bukan promptnya.

Pengguna yang menempelkan prompt ke Stitch di browsernya — Lumitome tidak
membuka Stitch. Sediakan tiap prompt sebagai blok kode yang siap disalin.

### Langkah 6 — Migrasi ke Vcraft (opsional, rekomendasi tutorial)

Tutorial sumber merekomendasikan Vcraft — alternatif Figma yang gratis dan
open-source, dengan integrasi coding agent — sebagai tujuan migrasi dari
Stitch untuk alur kerja jangka panjang (desain sistem penuh + prototipe
interaktif yang elemennya bisa diklik). Sampaikan ini sebagai **rekomendasi
eksternal**, bukan kemampuan Lumitome: pengguna mengunduh dan memasang
Vcraft sendiri, dan Lumitome tidak terhubung ke Vcraft. Bila pengguna
memilih tetap di Stitch, langkah 5 sudah cukup — jangan memaksa migrasi.

## Delegasi — jangan mengajari ulang

| Topik | Delegasi ke |
|---|---|
| Token, spesifikasi komponen, design system | `design-system`; `design` untuk identitas brand |
| Kualitas visual, anti-slop, arah artistik | `design-taste-frontend`, `impeccable` (impeccable juga sudah mengenal format `DESIGN.md`) |
| Motion dan simulasi interaktif | `motion-design`, `web-sims` |
| PRD dan dokumen proyek | `docs-pack` (PRD + `DESIGN_SYSTEM.md` adalah input langkah 1–2; `design.md` dari langkah 3 mengisi `DESIGN_SYSTEM.md` itu) |
| Diagram arsitektur / ER dari UI | `diagram-design` |
| Penulisan dokumen | `doc-coauthoring`, `technical-writer` |

## Guardrails

- Jangan mengklaim Stitch/Gems/Vcraft bisa dijalankan, di-MCP-kan, atau
  diotomasi dari Lumitome. Bila pengguna meminta itu, jelaskan batasnya
  dan tawarkan artefak sebagai gantinya.
- Jangan menulis secret, API key, atau alamat endpoint LLM lokal ke
  `design.md`, prompt, atau `index.html`. Placeholder saja bila perlu
  (mis. `[API_BASE_URL]`).
- Jangan mengarang isi gambar referensi. Yang tidak terlihat, tandai
  sebagai tidak jelas dan tanyakan ke pengguna.
- Satu gambar referensi per sesi audit. Gambar kedua = audit baru, dengan
  `design.md` yang sama sebagai pedoman agar token tidak bercabang.
