# Cara berpikir warna — rasa dulu, hex belakangan

> **TEGAS: ini panduan persepsi, BUKAN hukum sains dan BUKAN aturan gate.**
> Tabel rasa → palet di bawah ini adalah cara orang umumnya merasakan
> kombinasi warna, berdasarkan contoh nyata — bukan rumus yang berlaku
> untuk semua orang dan semua budaya. Kritikus memakai file ini untuk
> menilai cocok/tidaknya palet dengan Rasa yang dideklarasikan Maker di
> DESIGN.md. Gate hanya memeriksa ambang yang tertulis di loopdesign
> §1/§2: proporsi aksen (warn bila aksen >10% luas terukur, fail bila
> >25%) dan banned-palette krim + terracotta (fail, kecuali pengecualian
> merek). Selain dua ambang itu, tidak ada satu pun baris di file ini
> yang menjadi vonis gate.

## Sumber

- Reel Instagram **winkhsin** (Winson Kho, kolaborasi dengan wepeka.id),
  11 November 2026, 52.418 like —
  https://www.instagram.com/reel/Dfn0WbdFdcb/ — tabel rasa → palet §1.
  Reel ini memberi nama kombinasi warna, bukan nilai hex; hex dipilih
  Maker dari palet yang di-deal (lihat §2).
- `design-taste-frontend/references/colour.md` §3 (proporsi), §5
  (colour-field), §7 (warna dan foto), §9 (keluarga terlarang).
- `design-taste-frontend/library/palettes.json` (56 palet terkurasi dari
  247 situs) — contoh palet §2, id + hex disalin persis dari file itu.

## 1 — Rasa → palet (dari reel winkhsin)

| Rasa yang mau dibuat | Palet | Dipakai untuk apa (di reel) |
|---|---|---|
| Lega, menenangkan | Biru langit + putih | Website travel — mockup "Terbang lebih jauh." |
| Hangat, nyaman | Krim + espresso brown | Website kopi — mockup "Kopi susu buat hari yang panjang." |
| Tegas, misterius, profesional | Hitam + putih | Brand yang mau tampil serius; aksen sedikit saja sudah terasa berani dan ekspresif |
| Sporty, clean | Court blue + putih | Website olahraga — foto pemain tenis di lapangan biru gelap |
| Berani, bikin cepat booking | Merah scarlet sebagai **aksen** di atas biru langit + putih | Tombol booking di website travel — aksen, bukan ground |
| Enerjik, bikin pengen main | Oranye sebagai **aksen** di atas court blue + putih | Tombol/aksen di website olahraga — aksen, bukan ground |

Cara membaca tabel ini: **rasa datang dari kombinasi dasar + aksennya,
bukan dari satu warna saja.** Biru langit + putih menenangkan; begitu
ditambah scarlet, rasanya berubah jadi berani. Court blue + putih itu
sporty; begitu ditambah oranye, rasanya berubah jadi energik. Jadi kalau
Maker mau mengubah rasa, yang diganti pertama adalah aksennya — bukan
merombak seluruh palet.

## 2 — Contoh palet yang sudah di-deal (dari palettes.json)

Jangan karang hex dari kepala. Pilih satu id di bawah ini (atau palet
lain dari `palettes.json`, atau palet merek), tulis id-nya di baris
`Palet:` DESIGN.md, lalu turunkan token 4–6 dari palet itu.

| id palet | Ground (bg) | Aksen (accent) | Cocok untuk rasa |
|---|---|---|---|
| `white-link-blue` ("Sheet and biro") | `#ffffff`, surface `#f4f4f4`, ink `#111111` | `#1a4be0` (teks `#ffffff`) | Lega, bersih — biru sebagai warna link + satu tombol, sisanya putih/hitam |
| `sky-field-navy` ("Sky and navy") | `#6bb4ee`, surface `#7dbdf0`, ink `#0e1822` | `#ff5a1f` (teks `#0e1822`) | Lega + energik — langit biru di belakang segalanya, kartu putih di atasnya, oranye hanya untuk tombol + satu kata |
| `white-signal-red` ("Signal red, white") | `#ffffff`, surface `#f2f2f2`, ink `#0a0a0a` | `#d92b21` (teks `#ffffff`) | Tegas + berani — putih/hitam saja, merah hanya satu kata headline, beberapa blok, atau tombol |
| `cool-white-slate` ("Frost and slate") | `#f7f9fa`, surface `#ecf0f2`, ink `#1f3038` | `#0d7480` (teks `#ffffff`) | Tenang, clean — putih dingin + slate, teal muncul maks sekali per layar |

Contoh pemakaian: Maker yang mau rasa "lega, menenangkan" untuk travel
bisa deal `sky-field-navy` — ground langit `#6bb4ee`, ink navy `#0e1822`,
aksen oranye `#ff5a1f` hanya untuk tombol booking. Maker yang mau rasa
"tegas, profesional" bisa deal `white-signal-red` — ground putih, ink
hitam, aksen merah `#d92b21` hanya untuk satu tombol.

## 3 — Proporsi 60-30-10 (dengan contoh hitung)

**60-30-10 adalah rasio perencanaan, bukan hasil ukur per layar.**
Rencanakan dulu, lalu ukur hasil rendernya.

- **Dominan 60** — ground + permukaan utama.
- **Sekunder 30** — surface satu tingkat dari ground + teks sekunder.
- **Aksen 10** — aksi primer + maks 1 hal lain.

Contoh hitung (landing travel, 100 unit visual): Dominan 60 = ground
biru langit/putih; Sekunder 30 = surface kartu putih + teks navy;
Aksen 10 = tombol booking scarlet + satu angka kunci (mis. harga).
Aksen 10 di sini adalah **jatah perencanaan untuk seluruh halaman** —
bukan 10% di setiap layar.

**Rekonsiliasi dengan ambang layar app (jujur):** di layar app, Ground
menutupi 70–90% halaman dan aksen yang terukur harus **<5% per layar**
(`colour.md` §3). Jadi angka 10% dipakai saat merencanakan palet,
angka <5% dipakai saat mengukur satu layar render. Kalau hasil ukur
per layar menunjukkan aksen >10% (warn) atau >25% (fail), Maker yang
salah menaruh aksen — bukan angkanya yang salah.

## 4 — Keluarga terlarang

- **Krim + terracotta bersamaan.** Ground kuning-krim (hue kira-kira
  22–62, terang dan cukup jenuh) + aksen rust/clay/burnt-orange adalah
  ciri halaman hasil AI. Satu dari keduanya saja sudah mencurigakan;
  bersamaan, hampir pasti terbaca generik. Kalau mau hangat, ambil dari
  ground stone/bone/putty yang saturasinya rendah (di bawah ~15%), dari
  ink hijau tua/cokelat/oxblood, dari foto, atau dari satu field hangat
  penuh (mustard, tomato red, pink) yang dipakai datar dan yakin.
- **Violet/indigo.** Gelombang pertama halaman hasil AI berwarna ungu;
  masih terbaca begitu sampai sekarang.
- **Gradien ungu ke biru** sudah dicek gate (`purple-gradient`).
- **Pengecualian merek:** kalau merek memang punya warna itu, warna itu
  milik merek — pertahankan, catat pengecualiannya di DESIGN.md (seperti
  `--keep palette` di taste-skill), dan jangan tambah warna terlarang
  lain di sekelilingnya.

## 5 — Colour-field (ganti ground antar-section)

Section yang mengganti seluruh ground adalah move warna terkuat yang
ada — ia menggantikan divider, kartu, dan dekorasi latar sekaligus.

- Field bertemu edge-to-edge, garis keras. Tidak ada yang memudar.
- Tiap field punya ink sendiri dari palet. Jangan taruh `--muted` di
  atas field berwarna; pakai ink field itu dengan kekuatan penuh, atau
  70% opacity untuk teks sekunder bila kontrasnya masih lolos.
- Field tetangga harus beda terang (lightness), bukan cuma beda hue,
  kalau tidak halaman bergetar.
- Urutkan seperti bab: buka kuat, istirahat, kejutan, tutup gelap atau
  sangat terang. Situs top-scorer rata-rata memakai dua ground section,
  bukan satu.

## 6 — Warna dan foto

- Kalau foto yang membawa warna, interface tetap netral dan ink-nya
  diambil dari nada tergelap di foto.
- Jangan mencuci foto dengan warna merek. Biarkan apa adanya, atau
  perlakukan semua foto dengan cara yang sama (semua greyscale, atau
  semua tanpa sentuhan).
- Teks di atas foto butuh area yang tenang. Kalau tidak ada, pindahkan
  teks keluar dari foto. Satu-satunya gradien yang diizinkan di sini
  adalah scrim netral (hitam atau warna ink, opacity 30–55%) di area
  teks saja.

## 7 — Cara kritikus memakai file ini

Kritikus membaca file ini + Rasa dan Palet di DESIGN.md, lalu menjawab
checklist warna di loopdesign §3 poin 7 (advisory, bukan gate):

1. Aksen ≤10%?
2. Ada keluarga terlarang tanpa pengecualian merek?
3. Palet cocok dengan Rasa + Karakter?
4. Ganti ground antar-section terasa seperti bab atau tempelan?
5. Satu elemen terang + chrome diam?
6. Foto membawa warna atau interface netral?
7. Tiap field punya ink sendiri, bukan `--muted` di atas field berwarna?

Kalau jawaban no. 3 adalah "tidak cocok", kritikus tidak menyuruh
Maker menambah warna — ia menyuruh Maker **redraw palet sekali**
dengan palet lain dari `palettes.json` yang rasanya cocok.
