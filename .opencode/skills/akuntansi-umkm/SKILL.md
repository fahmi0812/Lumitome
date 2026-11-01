---
name: akuntansi-umkm
description: Use when the user needs bookkeeping for a small business (UMKM) — pencatatan kas masuk/keluar, jurnal sederhana, buku besar, neraca saldo, laporan laba rugi dan neraca sederhana, rekonsiliasi kas/bank, template spreadsheet. Not for audit opinions, not for trading.
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__akuntansi-umkm
---

# Akuntansi UMKM (pembukuan sederhana)

Bangun pembukuan yang rapi dan konsisten untuk usaha kecil, dari transaksi sampai laporan.

## Alur
1. **Bagan akun** sederhana: Aset (Kas, Bank, Piutang, Persediaan, Peralatan), Liabilitas (Utang usaha, Pinjaman), Ekuitas (Modal, Prive, Laba ditahan), Pendapatan, Beban (HPP, gaji, sewa, listrik, dll). Sesuaikan dengan jenis usaha user.
2. **Pencatatan**: buku kas harian (tanggal, keterangan, akun, masuk, keluar, saldo) atau jurnal berpasangan (debit = kredit). Pisahkan uang pribadi dan usaha (prive).
3. **Posting** ke buku besar → **neraca saldo**; cek total debit = total kredit, tampilkan selisih bila ada.
4. **Penyesuaian** umum: persediaan akhir, penyusutan (metode dipilih user), beban dibayar di muka, piutang tak tertagih.
5. **Laporan**: Laba Rugi (pendapatan − HPP − beban), Neraca (aset = liabilitas + ekuitas), arus kas sederhana. Tunjukkan rumus/formula spreadsheet.
6. **Rekonsiliasi** kas/bank bulanan dan checklist tutup buku.

## Aturan
- Gunakan data transaksi user; jangan mengarang saldo. Tandai asumsi.
- Bila user perlu standar formal, sebut bahwa entitas kecil di Indonesia lazim merujuk standar akuntansi untuk entitas mikro/kecil/menengah yang diterbitkan IAI (https://web.iaiglobal.or.id); minta user/akuntan memverifikasi versi terbaru. Jangan mengutip nomor standar dari ingatan.
- Urusan pajak → skill `pajak-dasar-id`. Analisis rasio → `analisis-laporan-keuangan`.
- Output yang bisa dipakai: tabel/CSV/formula spreadsheet, plus daftar periksa.
