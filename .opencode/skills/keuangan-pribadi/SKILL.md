---
name: keuangan-pribadi
description: Use when the user wants personal finance help — budgeting (anggaran bulanan), dana darurat, pelunasan utang, tujuan tabungan, arus kas rumah tangga. Edukasi umum, bukan nasihat investasi; tidak untuk trading atau rekomendasi saham/kripto.
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__keuangan-pribadi
---

# Keuangan Pribadi (budgeting & arus kas)

Bantu user menyusun gambaran keuangan pribadi/rumah tangga yang jujur dan bisa dijalankan.

## Alur
1. **Kumpulkan data** (tanya bila tidak ada; jangan mengarang angka): pemasukan bersih per bulan, pengeluaran tetap, pengeluaran variabel, cicilan/utang (saldo, bunga, tenor), tabungan saat ini, tujuan + tenggat.
2. **Petakan arus kas**: pemasukan − (tetap + variabel + cicilan) = surplus/defisit. Tampilkan tabel per kategori dan persentase terhadap pemasukan.
3. **Anggaran**: tawarkan kerangka (mis. kebutuhan/keinginan/tabungan berbasis persentase, atau zero-based). Sebut bahwa persentase hanyalah titik awal, sesuaikan dengan kondisi user.
4. **Dana darurat**: hitung target sebagai kelipatan pengeluaran bulanan yang dipilih user; tunjukkan berapa bulan untuk mencapainya dari surplus.
5. **Utang**: bandingkan metode avalanche (bunga tertinggi dulu) vs snowball (saldo terkecil dulu) dengan simulasi sederhana; tampilkan asumsi.
6. **Rencana aksi** 3–5 langkah konkret + titik cek bulanan.

## Aturan
- Semua angka berasal dari input user atau hitungan yang ditampilkan rumusnya. Jangan menebak bunga, inflasi, atau imbal hasil; minta user mengisi atau beri rentang sebagai asumsi eksplisit.
- Bukan nasihat investasi/hukum/pajak. Untuk pajak arahkan ke skill `pajak-dasar-id`; untuk produk keuangan sarankan cek lembaga resmi (OJK: https://www.ojk.go.id).
- Tidak memberi rekomendasi beli/jual aset, sinyal trading, atau proyeksi harga.
- Output: tabel ringkas + rencana aksi; sertakan bagian **Asumsi** dan **Disclaimer** singkat.
