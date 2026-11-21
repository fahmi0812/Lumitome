# Cara berpikir space — kurangi dulu, tambah belakangan

> **TEGAS: ini panduan persepsi, BUKAN hukum sains dan BUKAN aturan gate.**
> Ruang kosong di bawah ini adalah cara orang umumnya merasakan
> desain yang lega atau sesak, berdasarkan contoh nyata — bukan rumus
> yang berlaku untuk semua orang dan semua budaya. Kritikus memakai
> file ini untuk menilai cocok/tidaknya ruang kosong dengan Ruang yang
> dideklarasikan Maker di DESIGN.md. Gate hanya memeriksa ambang yang
> tertulis di loopdesign §1/§2: kepadatan ruang (space-density, warn
> bila ruang kosong terukur <10% viewport, advisory saja dan tidak
> pernah menggagalkan gate). Selain ambang itu, tidak ada satu pun
> baris di file ini yang menjadi vonis gate.

## Sumber

- Reel Instagram **attar.psd** ("tukang desain"), 23 Agustus 2026,
  140,3 rb like, 916 komentar —
  https://www.instagram.com/reel/DcYKRKCThZ3/ — definisi space §1
  dan contoh poster + layout §2. Reel ini memberi contoh dan cara
  berpikir, bukan angka spacing; angka jarak antar elemen tetap di
  `references/unslop-tokens.md` § "Skala spacing".

## 1 — Apa itu space (dari reel attar.psd)

**Space = area kosong dalam desain — negative space — supaya desain
bisa "bernapas".** Simpelnya: harus ada area yang kosong, gitu, untuk
bernapas. Bukan sisa yang tidak terpakai, bukan halaman yang belum
selesai — melainkan area yang sengaja dibiarkan kosong supaya mata
punya tempat istirahat dan satu hal utama bisa menonjol.

Kenapa penting: dengan ruang kosong, desain jadi lebih enak dilihat
daripada versi sebelumnya yang penuh dan sesak. Yang padat memaksa
mata membaca semuanya sekaligus; yang lega memberi tahu mata mana
yang harus dibaca dulu.

**Kritik terhadap AI (dari reel):** AI tidak mengerti rasio dan tidak
mengerti negative space. AI seolah menganggap desain harus selalu
penuh agar kelihatan menarik, padahal kadang yang dibutuhkan justru
mengurangi elemen. Ciri hasilnya: ramai dan heboh, semua elemen
berteriak sekaligus.

## 2 — Contoh (dari reel attar.psd)

**Poster "Chicken D'Mai" — Special Ayam Geprek Rp 15.000.** Poster
hasil AI yang super padat: foto ayam geprek/nasi/timun, foto interior
restoran, banyak teks ("Pedasnya Nampol, Rasanya Mantul!", "PESAN
SEKARANG!", badge "100% DAGING AYAM"), plus hiasan sapuan kuas
(brush) di mana-mana. Bayangkan kalau brush-nya dihilangin, beberapa
elemennya dikurangi, warnanya dikurangi — desain yang sama jadi lebih
enak dilihat. Yang berubah bukan isinya, melainkan yang dihapus.

**Layout padat vs layout lega.** Ilustrasi perbandingan di reel: layout
atas yang padat (banyak baris teks, 4 ikon avatar) diberi tanda silang
(X); panah ke bawah; layout bawah yang lebih lega (teks lebih sedikit,
3 avatar, ruang kosong lebih besar) diberi tanda centang. Isinya sama,
ruangnya yang beda — dan yang lega yang menang.

## 3 — Lima aturan (loopdesign §1, v0.3.81)

1. **Ruang kosong itu keputusan, bukan sisa.** Tulis `Ruang:` di
   DESIGN.md sebelum bangun — area mana yang sengaja dibiarkan kosong,
   dan apa yang sengaja dikurangi. Kosong yang tidak diputuskan akan
   diisi orang lain dengan dekorasi.
2. **Kurangi dulu.** Hapus dekorasi/brush/badge/elemen yang tidak
   membantu Momen; jangan tambah elemen untuk mengisi kekosongan.
   Kalau ragu apakah satu elemen perlu ada, hapus dulu — kalau Momen
   hilang, baru kembalikan.
3. **Satu layar, satu hal utama.** Elemen yang menonjol cuma 1–2 Momen,
   sisanya diam. Dua hal utama dalam satu layar saling berebut mata.
4. **Kosong ≠ belum selesai.** Jangan isi kekosongan hanya karena
   takut kosong. "Dikit lagi biar rame" adalah jebakan yang sama
   dengan yang dibuat AI.
5. **Cek lawan AI.** Kalau layout terasa padat dan ramai seperti
   poster AI, kurangi — jangan poles. Poster yang sesak tidak
   diselamatkan oleh warna atau tipografi yang lebih bagus.

## 4 — Yang TIDAK ada di reel (jujur, jangan dikarang)

Reel attar.psd **tidak memberi angka padding, margin, grid, atau
sistem spacing** — tidak ada jarak sekian piksel, tidak ada kelipatan
4/8, tidak ada rumus jarak. Jangan mengutip angka-angka itu sebagai
isi video.

Angka spacing numerik tetap merujuk ke `references/unslop-tokens.md`
§ "Skala spacing" (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96,
128 — di dalam kontrol 4–12, antar grup 12–24, antar section 32–64,
hero 96–128 dari navigasi ke headline di desktop). Bedanya: skala
spacing mengatur **jarak antar elemen**, sedangkan ruang kosong di
file ini mengatur **area yang sengaja dibiarkan kosong**. Keduanya
dipakai, bukan saling mengganti — jarak yang benar di atas halaman
yang sesak tetap terasa sesak.

Satu-satunya angka di reel adalah aturan warna yang dianalogikan
dengan space: **3 warna, rasio 60-30-10** (60% dominan, 30%
pendukung, 10% elemen) — itu sudah ada di `references/color-feel.md`
§3, bukan di file ini.

## 5 — Cara kritikus memakai file ini

Kritikus membaca file ini + Ruang di DESIGN.md, lalu menjawab
checklist space di loopdesign §3 poin 8 (advisory, bukan gate):

1. Ada area kosong yang disengaja?
2. Ada elemen yang bisa dikurangi tanpa kehilangan Momen?
3. Satu hal utama per layar?
4. Layout terasa sesak seperti poster AI?

Kalau jawaban no. 2 adalah "ada", kritikus tidak menyuruh Maker
menambah elemen atau memoles warna — ia menyuruh Maker **menghapus
elemen itu dulu** dan melihat apakah Momen masih utuh. Pengurangan
adalah perbaikan, bukan pengurangan kualitas.
