# design.md — [PROJECT / SCREEN]

Spesifikasi desain yang diekstrak dari gambar referensi. Satu-satunya sumber
kebenaran visual untuk Stitch dan untuk slicing front-end. Bila ada yang
tidak terlihat jelas di gambar, tulis `[tidak jelas — konfirmasi pengguna]`,
jangan mengarang.

## 1. Ringkasan layar

- Jenis layar: [dashboard / landing page / aplikasi …]
- Tujuan utama layar ini: [satu kalimat]
- Hirarki visual: [apa yang pertama dilihat, kedua, ketiga]

## 2. Foundation tokens

### Warna

| Token | Nilai | Pakai untuk |
|---|---|---|
| `primary` | #[HEX] | [tombol utama, link, focus ring] |
| `accent` | #[HEX] | [badge, highlight] |
| `ink` | #[HEX] | [teks utama] |
| `muted` | #[HEX] | [teks sekunder, caption] |
| `surface` | #[HEX] | [latar halaman / card] |
| `border` | #[HEX] | [garis pemisah] |
| `danger` / `success` | #[HEX] | [error / sukses] |

### Tipografi

- Font: [nama font — JANGAN pakai font default generik tanpa alasan]
- Display [ukuran]/[weight], Heading [ukuran]/[weight],
  Body [ukuran]/[weight], line-height [nilai], Small [ukuran]/[weight].

### Spasi & bentuk

- Skala spasi: [4, 8, 16, 24, 32, 64]
- Jarak antar section: [nilai]px. Padding card: [nilai]px.
- Radius sudut: [nilai]px. Elevasi/shadow: [nilai].

## 3. Grid & layout

- Lebar konten maks: [nilai]px, kolom: [angka], gutter: [nilai]px.
- Struktur: [sidebar + konten / header + grid 3 kolom / satu kolom …]
- Perilaku responsif: [apa yang berubah di layar kecil]

## 4. Komponen (atomic)

### Atom

- Tombol: [varian primer/sekunder/ghost, tinggi, radius, warna tiap state]
- Input: [tinggi, radius, focus ring]
- Badge: [bentuk pill, warna teks/latar]
- Ikon: [set ikon, ukuran]

### Molekul

- [Search bar: input + ikon + tombol]
- [Card info: judul + nilai + label]

### Organism

- Navbar/header: [isi, tinggi, posisi]
- Main grid / card list: [jumlah kolom, isi card]
- Footer: [isi]

Setiap komponen punya state hover, focus, disabled, dan loading.

## 5. Inkonsistensi yang ditemukan

- [Mis. dua ukuran tombol untuk fungsi yang sama → usulan satu token]
- [Tidak ada — bila gambar konsisten]

## 6. Catatan untuk Stitch

- Token di atas mengikat semua prompt modular (nav → grid → footer).
- Bila Stitch menghasilkan warna/ukuran di luar token ini, perbaiki
  `design.md` dulu, bukan promptnya.
