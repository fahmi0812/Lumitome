# Nilai token unslop — referensi Maker (titik awal, bukan aturan)

> **Kredit (CC BY 4.0):** disalin dari `references/tokens.md` di
> [unslop](https://github.com/heydamir/unslop) oleh Damir Sokolovsky
> ([@heydamir](https://x.com/heydamir)). Dipakai dan diadaptasi di Lumitome
> sesuai lisensi CC BY 4.0 — kredit ini wajib dipertahankan di salinan
> maupun adaptasi.
>
> **TEGAS: ini titik awal, BUKAN house style dan BUKAN aturan gate.**
> Maker boleh memakai nilai di bawah ini bila DESIGN.md tidak menentukan
> nilai sendiri — arah (Karakter/Dunia/Momen) yang menggerakkan nilai,
> bukan kebiasaan. Gate tetap hanya memeriksa token DESIGN.md
> (token-fidelity tidak berubah) dan tidak pernah memeriksa nilai-nilai
> di file ini.

Nilai awal untuk tiap pass (diadaptasi dari unslop). Bila proyek sudah
punya sistem yang bagus, pertahankan nilainya dan perbaiki cara
pemakaiannya saja.

## Skala spacing

4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128

- Di dalam kontrol: 4–12
- Antar item terkait (mis. baris dalam list): 2–8
- Antar grup (mis. label dan list-nya, dua kartu): 12–24
- Antar section: 32–64; section landing 80–128
- Tinggi baris: 32 compact, 36 default, 40–44 touch
- Hero: 96–128 dari navigasi ke headline di desktop, 48–64 di mobile

## Layout aplikasi

- Sidebar 240–280 lebar, konten fluid dengan padding halaman 24–32, dibatasi sekitar 1440–1600.
- Top bar / header halaman 56–64 tinggi.
- Baris navigasi 32–36, gap 2–4, label section 24 di atas dan 8 di bawah.
- Kartu stat dalam satu baris berbagi satu tinggi, biasanya 3–4 kartu compact per baris di desktop, hanya angka.
- Chart utama membentang minimal dua pertiga lebar konten dan tingginya 280–360. Blok data kedua di sebelahnya berupa list atau tabel yang lebih sempit, bukan chart kedua.

## Ramp netral

Untuk aplikasi dan dashboard pakai graphite, atau ramp yang sama abu-abunya,
untuk semua permukaan. Untuk landing page pilih ramp yang tint-nya cocok
dengan Dunia di arah. Warm cocok untuk kertas, kayu, makanan, kerajinan,
dan apa pun yang manusiawi. Ink cocok untuk malam, langit, air, dan apa
pun yang teknis. Ramp sendiri boleh di-tint dengan cara yang sama, jaga
saturasinya sangat rendah, supaya permukaan tidak terbaca sebagai warna.

### Gelap

| Peran | Graphite | Warm | Ink |
| --- | --- | --- | --- |
| Permukaan terdalam (mis. sidebar) | #0f0f10 | #12110f | #07080d |
| Background halaman | #141415 | #161513 | #0b0d14 |
| Kartu | #19191b | #1c1a18 | #11141c |
| Raised (mis. baris aktif / input) | #232325 | #262421 | #1a1e28 |
| Hairline | teks primer 8% | teks primer 8% | teks primer 8% |
| Teks primer | #ededed | #efe9de | #eef0f5 |
| Teks sekunder | #a1a1a6 | #aaa398 | #a3a9b8 |
| Teks muted dan ikon | #85858b | #8a847a | #7a8296 |

### Terang

| Peran | Graphite | Warm | Ink |
| --- | --- | --- | --- |
| Background halaman | #fafafa | #f7f4ee | #f5f7fa |
| Kartu | #ffffff | #fdfbf7 | #ffffff |
| Raised (mis. baris aktif / input) | #f4f4f5 | #efe9df | #eceff4 |
| Hairline | teks primer 8% | teks primer 8% | teks primer 8% |
| Teks primer | #171717 | #1f1b16 | #111827 |
| Teks sekunder | #525252 | #5e554a | #4b5565 |
| Teks muted dan ikon | #737373 | #7b7266 | #6b7487 |

Teks muted hanya untuk meta dan caption, dan tetap mendekati 4,5:1 di
permukaannya. Teks body memakai primer atau sekunder.

Warna semantik, dijinakkan supaya duduk di dalam ramp apa pun: positif
#4cc38a di gelap dan #16a34a di terang, negatif #e5484d di gelap dan
#dc2626 di terang.

## Aksen

- Pertahankan warna merek yang asli. Gradien violet ke biru atau hue ke
  hue lainnya adalah slop, bukan warna merek, kecuali user bilang begitu.
- Tanpa warna merek, ambil dari Dunia. Dunia warm cocok amber, coral,
  atau ember orange. Dunia cool cocok cobalt, teal, atau biru langit yang
  jernih. Dunia natural cocok moss atau sage. Hindari keluarga ungu ke
  biru kecuali merek memang ungu.
- Teks di atas aksen mencapai kontras 4,5:1. Gelapkan aksennya atau pakai
  teks gelap bila tidak mencapai.
- Aksen menutupi beberapa persen layar saja: aksi primer, seleksi, dan
  satu angka kunci.

## Tombol

- Tombol hero 44–48 tinggi, tombol navigasi 32–36, padding samping 16–20.
- Primer di gelap: off-white dari ramp dengan teks gelap, atau aksen.
  Primer di terang: warna teks primer sebagai fill dengan teks putih,
  atau aksen.
- Sekunder: permukaan raised dengan hairline, teks primer.
- Highlight atas yang lembut seperti `inset 0 1px 0 rgba(255,255,255,0.12)`
  pada tombol gelap memberi kedalaman tanpa glow.

## Keluarga type

Pilih sesuai Karakter di arah. Semuanya gratis; pasangan boleh dari baris
mana pun.

| Karakter | Keluarga antarmuka | Pasangan opsional |
| --- | --- | --- |
| Presisi, teknis, tenang | Geist, Inter, IBM Plex Sans | Geist Mono, IBM Plex Mono, JetBrains Mono untuk angka dan meta |
| Warm, ramah, manusiawi | Instrument Sans, DM Sans, Figtree | Instrument Serif atau Newsreader untuk headline hero saja |
| Editorial, literer, crafted | Inter atau Instrument Sans untuk antarmuka | Newsreader, Instrument Serif atau Fraunces untuk headline |
| Playful, berani | Space Grotesk, Bricolage Grotesque | mono untuk label kecil |

Serif display hanya untuk headline besar, jangan untuk label atau tombol.

## Skala type

| Pemakaian | Ukuran | Line height | Weight |
| --- | --- | --- | --- |
| Label kecil, meta, count | 12 | 16 | 400, mono boleh |
| Teks sekunder, caption | 13–14 | 20 | 400 |
| Body, item nav | 14–15 | 20–22 | 400–500 |
| Wordmark logo | 16–18 | 1 | 500–600 |
| Subhead hero | 18–20 | 28–30 | 400, warna sekunder, lebar maks 36rem |
| Angka kartu | 28–32 | 1 | 500, tabular |
| Judul halaman | 28–36 | 1,15 | 400–500 |
| Headline hero | 56–72 desktop, 36–44 mobile | 1,02–1,08 | 400–500 |

Letter spacing 0 untuk apa pun di bawah 16px; sedikit positif seperti
0.01em boleh untuk teks kecil muted. Teks display dari 40px boleh -0.02em,
dari 56px boleh -0.03em.

## Radius

| Elemen | Radius |
| --- | --- |
| Keycap, tag, tombol kecil | 4–6 |
| Baris, input, tombol | 8–10 |
| Kartu | 12–16 |
| Panel atau jendela | 14–20 |

Radius bersarang: inner = outer − padding, tidak pernah di bawah 4.
Kartu 16px dengan padding 8px memegang item ber-radius 8px.

## Ikon

Lucide, 16 atau 18px, stroke 1.5, warna peran teks muted atau sekunder,
gap 8–10px ke label.

## Kedalaman

- Gelap: langkah permukaan + hairline. Baris aktif boleh membawa
  `inset 0 1px 0 rgba(255,255,255,0.12)` sebagai highlight atas.
- Terang: `0 1px 2px rgba(0,0,0,0.05)` untuk hal kecil,
  `0 8px 24px rgba(0,0,0,0.06)` untuk yang melayang.

## Motion

Satu kurva easing untuk semuanya: `cubic-bezier(0.22, 1, 0.36, 1)`.

| Pemakaian | Durasi |
| --- | --- |
| Hover, press, toggle | 120–180ms |
| Menu, popover, tooltip | 160–220ms |
| Entrance, sheet, perubahan layout | 300–500ms |
| Stagger antar item | 40–60ms, maks 6 item |

- Jarak naik saat entrance: 6–12px. Skala press: 0.97–0.98.
- Transisi hanya color, background, border, opacity, dan transform.
