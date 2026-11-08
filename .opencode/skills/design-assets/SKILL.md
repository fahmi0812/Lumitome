---
name: design-assets
description: 'Cari komponen jadi dan aset desain dari 50 sumber web: shadcn/ui, ReUI, Watermelon UI, 21st.dev, Magic UI, HyperUI, daisyUI, NiceUI, Flowbite, Aceternity UI, Astryx — plus inspirasi desain (Awwwards, Mobbin, Land-book), design token (Coolors, Typewolf, Lucide, Material Design 3, Google Fonts), dan diagram (Excalidraw, Mermaid). Use for cari komponen, komponen jadi shadcn/ReUI/Astryx, aset desain, design token, inspirasi desain.'
license: MIT
metadata:
  swanwright_sector: coding
  swanwright_src: fahmi0812/Lumitome
  swanwright_original_id: lumitome__design-assets
  swanwright_original_name: design-assets
  swanwright_sha: 11038fd18e698646a893dd760642ef7666f6ac9c
---

# Design Assets: komponen jadi dari 50 sumber web

Pengetahuan retrieval aset jadi — mengikuti pola `external-tools`
(triage → fetch → verify). Prinsipnya: **kode terbaik adalah kode yang
tidak ditulis.** Tugas yang butuh Data Grid harus berujung ke komponen
ReUI/shadcn yang benar-benar ter-fetch, bukan komponen karangan.

## Cara pakai

1. **Tentukan kebutuhan**: komponen siap pakai, inspirasi, token, atau diagram.
2. **Pilih sumber** dari tabel di bawah — jangan loncat ke sumber inspirasi
   saat yang dibutuhkan adalah kode.
3. **Fetch komponen nyata, lalu verify**: registry/file benar-benar ada,
   versi terpin, lisensi cocok (MIT/Apache-2.0 diutamakan). Komponen yang
   tidak bisa di-fetch = tidak dipakai; tulis apa adanya, jangan dikarang.
4. **Pasang** via `external-tools` bila butuh install (npm/CLI).

## Sumber kode — komponen siap pakai

| Sumber | Cara fetch |
|---|---|
| shadcn/ui | CLI: `npx shadcn@latest add <komponen>`; atau registry JSON `ui.shadcn.com/r/<komponen>.json`; atau raw GitHub `shadcn-ui/ui`. |
| ReUI | Registry JSON / CLI di situs resmi ReUI; fetch raw file komponen dari repo GitHub-nya. Cocok untuk Data Grid dan komponen data-padat. |
| Watermelon UI | Registry / situs resmi; fetch raw file dari repo GitHub-nya. |
| 21st.dev | Registry komponen (situs 21st.dev); fetch dari registry-nya, periksa lisensi per komponen sebelum pakai. |
| Magic UI | Registry / CLI di situs resmi Magic UI; komponen animasi siap pakai. |
| HyperUI | Kumpulan komponen Tailwind gratis (situs HyperUI); salin sumber komponen, sesuaikan token proyek. |
| daisyUI | `npm install daisyui` + plugin Tailwind; komponen berbasis class Tailwind. |
| NiceUI | Registry / situs resmi; fetch raw file dari repo GitHub-nya. |
| Flowbite | `npm install flowbite` + plugin Tailwind; komponen + blok siap pakai. |
| Aceternity UI | Registry / situs resmi Aceternity; komponen animasi + efek; salin sumber komponen ke proyek. |

Aturan fetch umum bila satu sumber tidak punya CLI/registry yang jelas:
cek dokumentasi resmi sumber itu dulu, lalu fetch raw file dari repo
GitHub-nya. Jangan mengarang URL registry — bila URL tidak bisa diverifikasi
dari situs/repo resminya, katakan begitu dan pakai sumber lain.

## Sumber inspirasi — BUKAN aset, jangan copy

Galeri = inspirasi, bukan aset gratis. Pelajari struktur, pola layout,
hierarki, dan ritme visualnya; jangan copy teks, gambar, logo, atau merek
yang berhak cipta.

Awwwards, SiteInspire, Lapa Ninja, Land-book, One Page Love, Mobbin,
Saaspo, Unsection, Pricing Pages, Landingfolio, Component Gallery,
Collected, Aura, Refero Styles, Footer Design, Supahero, Navbar Gallery,
CTA Gallery, GetLayers, 404s.design, Oversight Supply, MotionSites,
Scrolltide, Bencho, Diagram Design.

## Token

| Kebutuhan | Sumber |
|---|---|
| Palet warna | Coolors |
| Pasangan font | Typewolf, Google Fonts |
| Ikon | Lucide, Phosphor |
| Sistem desain | Material Design 3 |
| Template / admin | TailAdmin |
| Motion | Motion, GSAP, React Bits |

Token yang dipakai harus ditulis ke `design.md` / `DESIGN_SYSTEM.md`
proyek (lihat `stitch-ui`, `design-system`) supaya semua bagian halaman
diikat token yang sama — bukan token baru per komponen.

## Diagram

Napkin AI, Excalidraw, diagrams.net, Mermaid Live. Pilih berdasarkan
kebutuhan: Napkin AI untuk diagram dari teks, Excalidraw untuk sketsa
tangan, diagrams.net untuk diagram formal (ER/arsitektur), Mermaid Live
untuk diagram-as-code yang bisa di-commit.

## Astryx — sumber komponen + CLI (BUKAN skill vendor)

- **Repo:** `meta/astryx`, MIT, Beta. **0 SKILL.md** — ini design system,
  bukan skill; dipakai via npm, bukan di-vendor ke repo.
- **Install:** `npm install @astryxdesign/core @astryxdesign/cli`
  (pin versi; jangan `@latest` tanpa mencatat versinya).
- **Isi:** 150+ komponen React, 7 tema (neutral, butter, chocolate, matcha,
  stone, gothic, y2k), template, CLI + `AGENTS.md`/`CLAUDE.md`.
- **Stack:** React 19 + StyleX. **Cocok untuk proyek web React/Next.js;
  tidak langsung untuk SIPALAB (Laravel) atau MotionSense (Android)** —
  untuk keduanya, pakai Astryx hanya sebagai referensi pola/struktur
  komponen, lalu tulis ulang di stack target.
- **Docs:** astryx.atmeta.com. Jangan salin dokumentasi upstream ke skill
  ini; baca bila butuh daftar komponen lengkap.

## Guardrail copyright

- Tiru **struktur / pola / token** — jangan copy teks, gambar, logo, atau
  merek berhak cipta dari sumber mana pun.
- Galeri inspirasi bukan aset gratis: screenshot referensi boleh diaudit
  (lihat `stitch-ui`), asetnya tidak boleh diambil.
- Periksa lisensi tiap komponen sebelum dipakai di proyek: MIT/Apache-2.0
  aman; lisensi lain baca dulu syaratnya. Komponen tanpa lisensi = jangan
  pakai.
- Jangan menulis secret, API key, atau alamat endpoint LLM lokal ke artefak
  desain.

## Delegasi — jangan mengajari ulang

| Topik | Delegasi ke |
|---|---|
| Instalasi (npm/CLI) | `external-tools` |
| Penilaian visual, anti-slop, arah artistik | `design-taste-frontend`, `impeccable`, `hallmark` |
| Rebuild deterministik dari desain Figcraft | `figcraft` (MCP, off by default) |
| Loop perbaiki desain berulang (render → gate → kritik) | `loopdesign` |
| Token + spesifikasi komponen + design system proyek | `design-system`, `design` |
| UI dari gambar referensi | `stitch-ui` |
