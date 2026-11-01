---
name: analisis-laporan-keuangan
description: Use when the user wants to analyze financial statements (laporan keuangan) — rasio likuiditas, solvabilitas, profitabilitas, efisiensi, analisis horizontal/vertikal, arus kas, kualitas laba, perbandingan antar periode atau perusahaan. Analisis fundamental berbasis data yang diberikan; bukan rekomendasi beli/jual saham, bukan trading.
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__analisis-laporan-keuangan
---

# Analisis Laporan Keuangan

Ubah neraca, laba rugi, dan arus kas menjadi temuan yang bisa dipertanggungjawabkan.

## Alur
1. **Data**: minta/ambil laporan (periode, mata uang, satuan, audited atau tidak). Untuk emiten, sumber primer laporan resmi perusahaan/bursa (mis. https://www.idx.co.id); kutip sumber + periode. Jangan mengarang angka.
2. **Normalisasi**: susun tabel akun utama per periode; catat pos luar biasa/non-berulang.
3. **Rasio** (tampilkan rumus + hasil):
   - Likuiditas: current ratio, quick ratio, cash ratio.
   - Solvabilitas: debt-to-equity, debt-to-assets, interest coverage.
   - Profitabilitas: gross/operating/net margin, ROA, ROE.
   - Efisiensi: perputaran piutang/persediaan/aset, siklus konversi kas.
   - Arus kas: CFO vs laba bersih, free cash flow.
4. **Analisis horizontal** (pertumbuhan antar periode) dan **vertikal** (common-size).
5. **Interpretasi**: kekuatan, risiko, red flag (mis. laba naik tapi CFO negatif, piutang tumbuh jauh di atas pendapatan); bandingkan dengan periode sebelumnya atau pembanding yang datanya tersedia.
6. **Ringkasan**: 3–5 temuan + data yang masih kurang.

## Aturan
- Semua angka dari dokumen yang diberikan/dikutip; tunjukkan perhitungan. Tidak ada "benchmark industri" dari ingatan; bila perlu, cari sumber dan kutip.
- Bukan nasihat investasi: tidak memberi target harga, sinyal beli/jual, atau strategi trading.
- Pembukuan dasar → `akuntansi-umkm`; pajak → `pajak-dasar-id`.
