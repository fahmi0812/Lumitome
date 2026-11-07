# Stitch prompt — template modular

Satu prompt per komponen, ditempel ke Google Stitch satu per satu dalam
urutan ini. `design.md` sudah dimasukkan ke Stitch sebagai pedoman visual
global — prompt di bawah hanya menambah spesifikasi komponen, bukan
mengulang token.

## Aturan umum prompt Stitch

- Sebutkan komponen, isinya, dan perilakunya — bukan ulang token warna/font
  (itu sudah ada di `design.md`).
- Satu komponen per prompt. Jangan gabungkan nav + grid + footer sekaligus.
- Bahasa prompt: [Indonesia / Inggris — samakan dengan `design.md`].
- Akhiri tiap prompt dengan: "Follow design.md tokens exactly. Do not invent
  new colors, fonts, or spacing."

## Prompt 1 — Navigasi + header

```text
Build the navigation bar and header for [PROJECT], a [jenis aplikasi].
Follow design.md tokens exactly.

Navigation: [logo di kiri, menu: … , aksi kanan: …].
Header: [judul halaman, subjudul, aksi utama: …].
Behavior: [sticky / statis, menu mobile jadi …].
Do not invent new colors, fonts, or spacing.
```

## Prompt 2 — Konten utama (main grid / card list)

```text
Build the main content grid for [PROJECT], following design.md tokens.
Use the navigation and header already generated — do not rebuild them.

Content: [grid N kolom berisi card … / tabel … / daftar …].
Each card shows: [judul, nilai, label, aksi].
Empty state: [ikon, satu kalimat, satu tombol].
Behavior: [filter/sort … , klik card → …].
Do not invent new colors, fonts, or spacing.
```

## Prompt 3 — Elemen pendukung + footer

```text
Build the supporting elements and footer for [PROJECT], following
design.md tokens. Keep the navigation and main grid already generated.

Supporting: [sidebar / panel detail / pagination …].
Footer: [link …, copyright …, status …].
Behavior: [ … ].
Do not invent new colors, fonts, or spacing.
```

## Bila hasilnya melenceng

1. Cek dulu: apakah `design.md` memuat token yang dilanggar? Bila tidak,
   tambah tokennya ke `design.md`, lalu ulangi prompt yang sama.
2. Bila token sudah ada tapi Stitch mengabaikannya, perpendek prompt dan
   sebutkan token yang dilanggar secara eksplisit satu per satu.
3. Jangan menumpuk koreksi dalam satu prompt panjang — satu perbaikan per
   pengiriman.
