---
name: design-assets
description: 'Cari komponen jadi dan aset desain dari 51 sumber web: shadcn/ui, ReUI, Watermelon UI, 21st.dev, Magic UI, HyperUI, daisyUI, NiceUI, Flowbite, Aceternity UI, Astryx — plus inspirasi desain (Awwwards, Mobbin, Land-book), design token (Coolors, Typewolf, Lucide, Material Design 3, Google Fonts), dan diagram (Excalidraw, Mermaid). Use for cari komponen, komponen jadi shadcn/ReUI/Astryx, aset desain, design token, inspirasi desain.'
license: MIT
metadata:
  swanwright_sector: coding
  swanwright_src: fahmi0812/Lumitome
  swanwright_original_id: lumitome__design-assets
  swanwright_original_name: design-assets
  swanwright_sha: bcfe239b105e5ddf82e81eff7cf44128a9723cf1
---

# Design Assets: komponen jadi dari 51 sumber web

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

Lisensi diverifikasi dari sumber primer (LICENSE repo / situs resmi) 2026-11-09.
"Gratis" = komponen inti; "Pro" = tier berbayar terpisah. Bila lisensi
ragu-ragu, jangan pakai — tulis apa adanya.

| Sumber | Lisensi (terverifikasi) | Cara fetch |
|---|---|---|
| shadcn/ui | MIT | CLI: `npx shadcn@latest add <komponen>`; atau registry JSON `ui.shadcn.com/r/styles/default/<komponen>.json`; atau raw GitHub `shadcn-ui/ui`. |
| ReUI | MIT (komponen gratis; Pro berbayar: blok + template) | Registry JSON / CLI di situs resmi ReUI; fetch raw file komponen dari repo GitHub-nya. Cocok untuk Data Grid dan komponen data-padat. |
| Watermelon UI | MIT (repo `WatermelonCorp/watermelon-platform`; repo registry lama 404) | Registry `ui.watermelon.sh/r/<komponen>.json` / situs resmi; fetch raw file dari repo `WatermelonCorp/watermelon-platform`. |
| 21st.dev | Per-komponen / per-author — TIDAK ada lisensi blanket (platformnya MIT) | Registry komponen (situs 21st.dev); fetch dari registry-nya, periksa lisensi per komponen ke repo asli author-nya sebelum pakai. |
| Magic UI | MIT (komponen gratis; template/blok Pro berbayar) | Registry / CLI di situs resmi Magic UI; komponen animasi siap pakai. |
| HyperUI | MIT | Kumpulan komponen Tailwind gratis (situs HyperUI); salin sumber komponen, sesuaikan token proyek. |
| daisyUI | MIT (inti gratis; ekstra berbayar: Blueprint MCP, store) | `npm install daisyui` + plugin Tailwind; komponen berbasis class Tailwind. |
| NiceUI | MIT per klaim situs — repo publik TIDAK ditemukan | Registry `niceui.dev/r/<komponen>.json` / situs resmi. JANGAN fetch dari GitHub (tidak ada repo yang bisa diverifikasi). |
| Flowbite | MIT (kode rilis; docs CC BY 3.0; Pro EULA; nama/logo trademark) | `npm install flowbite` + plugin Tailwind; komponen + blok siap pakai. |
| Aceternity UI | **PROPRIETARY — BUKAN MIT.** End-product use OK (unlimited end product, boleh dimodifikasi); **DILARANG** redistribusi source file, jual sebagai template/komponen, atau jual di marketplace; Pro All-Access berbayar | Registry / situs resmi Aceternity; komponen animasi + efek; salin sumber komponen ke proyek (end product saja — JANGAN vendor ke repo publik, itu redistribusi). |
| ScrollShaders | **KOMERSIAL — BUKAN open source.** Browsing/preview gratis; kode/MP4 berbayar. Personal + client work OK; **DILARANG** jual kembali/redistribusi shader sebagai library, template pack, atau asset bundle | Situs resmi scrollshaders.com; per shader: komponen React mandiri (.tsx) + snippet HTML+JS polos + MP4 loop + still PNG. Satu fragment shader WebGL2 per file — TIDAK butuh three.js. 164 shader + komponen, 77 background dalam 15 koleksi (terverifikasi 2026-11-10; BUKAN angka lama 117/11). |

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
Collected, Aura, Footer Design, Supahero, Navbar Gallery,
CTA Gallery, GetLayers, 404s.design, Oversight Supply, MotionSites,
Scrolltide, Bencho, Diagram Design.

Catatan health-check 2026-11-09: 49/50 sumber HIDUP, 0 mati. **Diagram
Design: URL belum terverifikasi** (`diagram.design` tidak resolve; SKILL.md
tidak mencantum URL) — jangan dipakai sebelum URL-nya dipastikan
(kandidat: `cathrynlavery/diagram-design`, belum dipastikan).

Catatan health-check 2026-11-10 (v0.3.37): kelima URL baru/dilengkapi di
bawah terverifikasi HIDUP (HTTP 200): scrollshaders.com,
styles.refero.design, scrolltide.co, footer.design, cta.gallery.

### Refero Styles — referensi DESIGN.md produk nyata (promosi entri v0.3.37)

- **URL:** https://styles.refero.design — Refero Inc., masih Beta.
- **Isi:** 2.000+ design system produk nyata (Apple, Perplexity, Raycast,
  Notion, Linear, dsb.) — tiap style berisi warna, tipografi, spacing,
  komponen, dan file DESIGN.md yang bisa dipakai di Cursor, Claude Code,
  Codex, v0, Lovable. Browsing + copy DESIGN.md GRATIS selama beta.
- **Catatan loopdesign:** referensi struktur/token arah untuk DESIGN.md
  (v0.3.36: Karakter/Dunia/Momen) — pelajari struktur/tokennya, JANGAN
  tiru brand.
- **Lisensi: TIDAK dinyatakan (beta).** Tiap style bernama brand asli;
  panduan Refero melarang merekreasi brand secara persis; font/brand
  tidak dilisensikan. Cek terms sebelum pakai komersial.
- **MCP-nya (api.refero.design/mcp) TIDAK diadopsi** — berbayar Pro;
  MCP wajib scan + pin versi dulu (aturan Lumitome).

### Entri inspirasi yang dilengkapi (v0.3.37)

- **Scrolltide** — https://scrolltide.co — Himanshu Hingorani
  (@himanshubuilds). Prompt + template website sinematik scroll-driven
  (3D, shader, scroll); copy prompt → Claude/Cursor/v0 → situs
  (Next.js/Tailwind/GSAP/Three.js atau Vite/Tailwind/Framer Motion).
  145 template, 86 komponen, 55 shader, 24 section, 14 UI screen
  (terverifikasi 2026-11-10; klaim "600+ prompt, 200+ komponen" TIDAK
  terverifikasi — jangan dipakai). Lisensi proprietary komersial
  (personal + client use; DILARANG jual kembali prompt/template, bikin
  library kompetitor, pakai video preview untuk marketing sendiri).
  Gratis: 4 template full file (Glacier, Fluxora, Monsoon, Aurora).
  JANGAN vendor kode; JANGAN beli lifetime $299 tanpa keputusan Fahmi.
- **Footer Design** — https://footer.design — Benten Woodring, Devin
  Fountain, Matt Cram (logo: Fons Mans); NOOON Studio. Galeri inspirasi
  footer (55 halaman koleksi). Galeri visual saja, tanpa kode; lisensi
  tidak dinyatakan (jangan copy aset/merek).
- **CTA Gallery** — https://cta.gallery — Salim Lunat (Webestica,
  Iconstica; terinspirasi footer.design). Galeri inspirasi CTA + tips
  copywriting. Galeri visual saja, tanpa kode; lisensi tidak dinyatakan
  (copy teks milik brand asal — jadikan referensi nada, jangan copy
  verbatim).

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

Catatan lisensi token (terverifikasi 2026-11-09): **React Bits = MIT +
Commons Clause v1.0** (bukan OSI; komersial OK, dilarang menjual /
mendistribusikan ulang komponen itu sendiri). **GSAP = lisensi standar
"No Charge" Webflow/GreenSock, bukan MIT** (gratis penuh, komersial OK;
larangan: membangun tool animasi no-code pesaing Webflow).

## Celah yang diketahui (health-check 2026-11-09 — belum ditambah sumber)

Semua 10 sumber kode adalah React/Tailwind web. Yang belum tercakup:
komponen native Android (MotionSense Recorder), Laravel/Blade (SIPALAB —
kandidat varian Blade Flowbite `themesberg/flowbite-laravel-components`
TIDAK punya LICENSE file di repo, dicek 2026-11-09, jangan pakai sebelum
lisensinya dipastikan), chart/data-visualisasi, foto/ilustrasi stok, dan
pemeriksa aksesibilitas/kontras eksternal. Jangan tambah sumber demi jumlah —
tambah hanya bila ada kebutuhan nyata + lisensi terverifikasi.

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
