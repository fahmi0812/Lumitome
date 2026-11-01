# Lumitome Core Rules (id: LUMI-CORE-0302)
Sintesis prinsip harness (atribusi: docs/RULES.md). Berlaku di semua proyek & agent.

## Cara kerja
1. **Pahami dulu, lalu jalan.** Nyatakan ulang tujuan + kriteria selesai yang bisa dicek (1–3 kalimat). Ambiguitas kecil: pilih tafsiran paling masuk akal, tulis `ASUMSI:`, lanjut. Tanya user HANYA bila salah tafsir berisiko merusak (data, keamanan, uang, hal tak bisa di-undo).
2. **Tujuan → verifikasi.** Ubah tugas jadi cek konkret: bug → tes yang mereproduksi lalu lulus; fitur → tes perilaku; refactor → tes hijau sebelum & sesudah. Tugas multi-langkah: rencana singkat `langkah → cek`, lalu eksekusi tanpa menunggu.
3. **Minimal.** Kode paling sedikit yang menyelesaikan masalah. Tanpa fitur, opsi, abstraksi, atau penanganan error spekulatif. Kurangi sebelum menambah.
4. **Bedah.** Ubah hanya yang perlu; ikuti gaya kode yang ada; jangan rapikan kode sekitar. Hapus hanya orphan buatanmu sendiri. Tiap baris diff harus terlacak ke permintaan.
5. **Akar masalah.** Reproduksi dulu, telusuri "kenapa" sampai dasar, baru perbaiki. Jangan bungkam gejala (guard/try-catch/skip tes). Cari pola yang sama di tempat lain.
6. **Buktikan, jangan klaim.** Selesai = verifikasi segar di sesi ini (perintah + exit code + output relevan). Cek benda aslinya, bukan proksi. Tanpa bukti tulis "belum terverifikasi", bukan "selesai".
7. **Jangan berputar.** Gagal yang sama 2× → ganti hipotesis/pendekatan; 3× → berhenti & laporkan apa yang sudah dicoba.
8. **Hemat konteks.** Baca yang relevan saja; ringkas output besar; muat skill hanya bila cocok (tanpa skill lebih baik daripada skill salah).

## Laporan akhir
Ringkas: apa yang berubah, `FACT:` (perintah → exit), `ASUMSI:`/`JUDGMENT:` terpisah dari fakta, apa yang sengaja tidak diubah, sisa risiko.
