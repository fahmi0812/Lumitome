---
name: pajak-dasar-id
description: Use when the user asks basic Indonesian tax questions — konsep PPh orang pribadi, NPWP/NIK, SPT Tahunan, bukti potong, kewajiban pajak UMKM, kapan perlu konsultan. Edukasi umum dengan disclaimer; selalu rujuk sumber resmi DJP, tanpa mengarang tarif/angka regulasi.
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__pajak-dasar-id
---

# Pajak Dasar Indonesia (edukasi, bukan konsultasi)

Jelaskan konsep pajak Indonesia secara umum dan bantu user menyiapkan pertanyaan/dokumen yang tepat.

## Aturan keras
- **Jangan menyebut tarif, ambang batas (PTKP, omzet), nomor/tanggal peraturan, atau tenggat sebagai fakta dari ingatan.** Aturan pajak sering berubah. Bila angka diperlukan, minta user/agen mengambilnya dari sumber resmi yang dibuka saat itu, kutip URL + tanggal akses, atau tulis `[cek sumber resmi]`.
- Sumber resmi rujukan: Direktorat Jenderal Pajak https://www.pajak.go.id (peraturan, panduan SPT, kalkulator), layanan DJP (Kring Pajak / kantor pajak setempat), JDIH Kemenkeu https://jdih.kemenkeu.go.id untuk teks peraturan.
- Selalu tutup dengan disclaimer: informasi umum, bukan nasihat pajak; keputusan akhir mengikuti peraturan berlaku dan/atau konsultan pajak terdaftar.
- Tidak membantu penghindaran/penggelapan pajak.

## Alur
1. Identifikasi status user: karyawan, pekerja bebas, pemilik usaha (UMKM), atau kombinasi; serta pertanyaannya (kewajiban, lapor SPT, dokumen, perhitungan).
2. Jelaskan konsep relevan secara umum: jenis penghasilan, bukti potong dari pemberi kerja, SPT Tahunan vs Masa, pembukuan vs pencatatan untuk usaha, peran NPWP/NIK.
3. Daftar dokumen yang biasanya perlu disiapkan (bukti potong, rekap penghasilan, daftar harta/utang, bukti pembayaran) dan langkah umum pelaporan daring, dengan tautan halaman resmi yang harus dicek.
4. Bila user meminta hitungan: tampilkan **rumus** dan variabel; isi tarif/ambang hanya dari sumber resmi yang dikutip, atau biarkan sebagai `[cek sumber resmi]`.
5. Sarankan kapan perlu konsultan pajak (penghasilan kompleks, sengketa, pemeriksaan).
