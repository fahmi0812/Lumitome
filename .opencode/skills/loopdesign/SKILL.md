---
name: loopdesign
description: 'Perbaiki desain berulang sampai bagus lewat loop render → gate → kritik (loopdesign / desain loop): Maker direction-first (DESIGN.md: arah + token) + pre-mortem 3 jebakan AI-slop sebelum coding, bangun dari komponen nyata, render jadi screenshot, ukur dengan Design-Gate deterministik (viewport, kontras, tap target, kesetiaan token), lalu kritikus red team menyerang hasilnya — perbaiki dan ulang sampai gate lolos, maks N iterasi (default 3). Use for perbaiki desain berulang sampai bagus, loopdesign, desain loop, uji desain, kritik desain, red team desain.'
license: MIT
metadata:
  swanwright_sector: coding
  swanwright_src: fahmi0812/Lumitome
  swanwright_original_id: lumitome__loopdesign
  swanwright_original_name: loopdesign
  swanwright_sha: bcfe239b105e5ddf82e81eff7cf44128a9723cf1
---

# Loopdesign: perbaiki desain berulang sampai gate lolos

Desain dinilai dari **gambar** (screenshot/export render), bukan dari kode.
Satu iterasi = Maker bangun → render → Design-Gate ukur → kritikus serang →
Maker perbaiki. Loop berhenti begitu gate lolos — atau begitu tidak ada
perbaikan — atau begitu budget iterasi habis. Tidak pernah spin.

## Batas yang jujur — baca dulu

- **Tanpa render, tidak ada loop.** Maker yang menilai karyanya sendiri dari
  kode adalah akar masalahnya (20+ skill desain aktif, output tetap slop).
  Klaim "sudah bagus" tanpa screenshot + hasil gate = klaim kosong.
- **Gate yang memutuskan, bukan kritikus.** `harness/design-gate.mjs`
  (deterministik: input render PNG + metrik terhitung dari
  `harness/design-measure.mjs`, output `{pass, findings[]}`) adalah satu-satunya
  vonis lolos/gagal — ditambah behavior gate (`harness/design-behavior.mjs`:
  probe interaksi terskrip dari kontrak Maker, findings `behavior` /
  `probe-gagal`). Kritikus memberi pendapat; gate memberi vonis. Kritikus
  pairwise (§3) hanya menginformasikan — tidak pernah mengubah vonis.
- **Maker ≠ kritikus.** Kritikus adalah sub-agent terpisah `design-critic` (`.opencode/agents/design-critic.md`, depth 1, konteks sendiri, read-only). Ia menerima paket bersih hasil `criticInput()` (`harness/design-gate.mjs`: screenshot + hasil ukur gate + brief/token + hasil probe perilaku + arah) — tidak pernah melihat kode atau klaim Maker. Maker yang menilai dirinya sendiri batal; `reviewer` khusus meninjau kode, bukan kritik visual `/loopdesign`.
- **State machine deterministik (`harness/design-loop.mjs`):** siklus eksplisit `DRAFT → MEASURE → GATE → CRITIC → PATCH → DONE | HALT` (state tersimpan di `<workspace>/.tmp/loopdesign/loop-history.jsonl`), mengorkestrasi `measureAndGateWithBehavior()`, `collectDomSummary()`, `comparePairwise()`, `criticInput()`, dan `evaluateDoneGate()`. Tidak ada `DONE` tanpa lolos Design-Gate + Behavior Probe + Done-Gate.
- **Gate menilai kesetiaan token + aksesibilitas (deterministik).**
  "Terlihat bagus", "terasa modern", "cocok untuk sidang" bukan kerja gate —
  itu kerja kritikus (§3).

## 1 — Direction-first + pre-mortem SEBELUM coding (oleh Maker)

Sebelum menulis satu baris kode pun, Maker wajib commit **SATU arah estetika
bernama** dan menulisnya ke **`DESIGN.md`** di workspace tugas (pola
Anthropic frontend-design) — formatnya:

```
# DESIGN.md — <nama proyek>
Arah: <nama arah estetika, mis. "Hangat artisanal">
Karakter: <2–3 kata konkret, mis. "tenang, teliti, sedikit hangat">
Dunia: <tempat/material produk, mis. "kertas dan tinta">
Momen: <1–2 titik yang boleh kaya warna, mis. "grafik utama + kartu perangkat">
Rasa: <rasa yang mau dibuat, mis. "lega dan menenangkan">
Palet: <id palet dari design-taste-frontend/library/palettes.json, mis. white-link-blue> — atau "merek sendiri" bila brand sudah punya warna
- Dominan 60% — #RRGGBB — <peran, mis. ground>
- Sekunder 30% — #RRGGBB — <peran, mis. surface / teks sekunder>
- Aksen 10% — #RRGGBB — <peran: aksi primer + 1 hal lain saja>
Field: <opsional — daftar field + ink-nya, mis. "hitam #111111 / putih">
Ruang: <area kosong utama + apa yang sengaja dikurangi, mis. "hero lega; brush & badge dikurangi">
Token:
- #RRGGBB — <peran, mis. kopi (teks/heading)>
- ... (4–6 hex)
Netral:
- --text-muted: tint #RRGGBB 60%
- --border: tint #RRGGBB 15%
Tipografi: <font display> (display), <font body> (body)
Signature: <satu elemen signature>
```

**Rekonsiliasi angka proporsi (jujur, jangan dipaksa satu angka):**
`60-30-10` adalah rasio **perencanaan** brand/landing — Dominan 60 /
Sekunder 30 / Aksen 10. Di **layar app**, aksen yang terukur harus
**<5% per layar** (`design-taste-frontend/references/colour.md` §3) dan
Ground **70–90%** halaman. Keduanya dipakai, bukan dipaksa satu angka:
60-30-10 untuk merencanakan palet, <5% untuk mengukur hasil render per
layar. Detail + contoh hitung ada di `references/color-feel.md`.

**Karakter / Dunia / Momen (v0.3.36, diadaptasi dari unslop — CC BY 4.0,
Damir Sokolovsky):** tiga baris ini yang membedakan arah yang diputuskan
dari template generik. **Karakter** = 2–3 kata konkret tentang produk
(mis. "tenang, teliti, sedikit hangat" / "cepat, teknis, playful") —
kata generik `clean, modern, sleek, minimal, premium` **DILARANG** karena
menggambarkan semua template. **Dunia** = tempat/material yang secara
alami dimiliki produk (aplikasi catatan hidup dekat kertas dan tinta,
alat monitoring dekat instrumen dan shift malam, aplikasi travel dekat
peta dan cahaya jendela) — Dunia menentukan tint ramp netral. **Momen**
= satu-dua tempat layar boleh kaya warna, material, dan detail, dipilih
dari apa yang ditampilkan produk (kartu/device hasil render di dalam
preview, chart yang tiap warnanya berarti satu seri, objek dari Dunia
di samping konten) — sisanya chrome diam: **satu elemen terang, chrome
diam**. Bila produk sudah punya merek asli (file logo, warna, atau
typeface yang bukan slop), pertahankan dan bangun arah di sekelilingnya.
Nilai konkret sebagai titik awal (skala spacing, ramp netral, skala type,
radius, motion) ada di `references/unslop-tokens.md` — **titik awal,
BUKAN house style dan BUKAN aturan gate**; arah yang menggerakkan nilai,
bukan kebiasaan.

**Referensi desain (tautan, bukan aturan):** font gratis berkualitas untuk
Tipografi di atas — **fontshare.com** (Satoshi, Clash Display, General Sans,
gratis untuk pemakaian komersial) — jangan pakai font default generik.
Bank referensi arah + golden — **prettysites.io** (49 desain website high-end,
masing-masing dengan prompt lengkap): tiru struktur/layout/animasi yang cocok
dengan arah, bukan jiplak mentah.

`DESIGN.md` adalah source of truth: **Maker hanya memakai token deklarasi
di CSS — tidak ada raw hex di luar DESIGN.md.** Warna di luar token =
finding `token-fidelity` di gate (fail) — finding-nya menyebut nama
variabel CSS + saran ganti (token terdekat / tint dari token), jadi
langsung bisa dikerjakan. **Warna netral (muted, border, dsb.) WAJIB
dideklarasikan di seksi `Netral:` sebagai tint turunan token** (mis.
`--text-muted: tint #F2F2F7 60%`) — Maker tidak boleh menciptakan netral
sendiri. Warna merek yang memang dibutuhkan (mis. hijau WhatsApp) harus
ikut dideklarasikan sebagai token, bukan diselipkan diam-diam. Bila brief
tidak memberi token, Maker menetapkan 4–6 token sendiri di DESIGN.md
sebelum coding — jangan mulai dari CSS tanpa arah tertulis.

**Aturan token-fidelity dulu:** bila yang tersisa hanya findings
token-fidelity, Maker memperbaiki persis itu dulu sebelum poles apa pun —
jangan menghabiskan iterasi untuk polesan sementara warna di luar token
masih ada.

**Cara berpikir warna — rasa dulu, hex belakangan (v0.3.80)**

Ini cara berpikirnya, bukan daftar hex. Hex dipilih belakangan, setelah
Rasa diputuskan. Panduan lengkap (tabel rasa → palet, contoh palet,
contoh hitung 60-30-10) ada di `references/color-feel.md`.

1. **Rasa dulu baru hex.** Tulis `Rasa:` di DESIGN.md sebelum memilih
   hex. Kritikus menilai cocok/tidaknya palet dengan Rasa + Karakter —
   bukan sekadar "warnanya bagus".
2. **60-30-10.** Dominan 60 / Sekunder 30 / Aksen 10 (rasio perencanaan,
   lihat rekonsiliasi di atas). Aksen menutupi paling sedikit: aksi
   primer + maks 1 hal lain. Begitu aksen muncul di lima tempat, ia
   berhenti berarti "di sini".
3. **Satu aksen, satu elemen terang, chrome diam.** Chrome (nav, tombol,
   teks, border) pakai netral tint + satu aksen. Kekayaan warna hanya di
   1–2 Momen — satu elemen terang, sisanya diam.
4. **Aksen bukan untuk heading/ikon/border/underline** kecuali direction
   sheet bilang begitu. Headline itu ink.
5. **Cek palet lawan subjek** (`design-taste-frontend/references/colour.md`).
   Palet yang cocok untuk kopi belum tentu cocok untuk travel; palet
   pastel manis untuk whisky gambut atau neon untuk gubuk gunung itu
   salah alamat. Kalau tidak cocok, redraw palet sekali — jangan
   memaksa palet yang salah dengan menambah warna lain.
6. **Keluarga terlarang.** Krim + terracotta bersamaan, dan violet/indigo,
   dilarang — kecuali merek memang punya warna itu. Pengecualian wajib
   dicatat di DESIGN.md (seperti `--keep palette` di taste-skill), kalau
   tidak, gate menganggapnya pelanggaran.

**Aturan deal palet (v0.3.80):** Maker WAJIB deal/pilih **1 palet** dari
`design-taste-frontend/library/palettes.json` (tulis id-nya di baris
`Palet:` DESIGN.md) atau pakai palet merek bila brand sudah punya warna
(tulis "merek sendiri"). Dilarang mengarang 4–6 token dari kepala tanpa
rujukan — token 4–6 di DESIGN.md diturunkan dari palet yang di-deal atau
dari palet merek itu.

**Cara berpikir space — kurangi dulu, tambah belakangan (v0.3.81)**

Ini cara berpikirnya, bukan sistem spacing. Jarak antar elemen (angka)
tetap di `references/unslop-tokens.md` § "Skala spacing"; yang di sini
adalah keputusan soal ruang kosong. Panduan lengkap (contoh poster,
perbandingan layout) ada di `references/space.md`.

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

Lalu, Maker wajib mendeklarasikan **kontrak interaksi** halaman — daftar
interaksi + keadaan awal yang diharapkan + hasil klik yang diharapkan —
sebagai blok fenced ```` ```behavior-contract ```` di `DESIGN.md` (atau
file `behavior.json` di workspace tugas, format sama):

```behavior-contract
{
  "initial": [
    { "id": "cart-empty", "label": "keranjang kosong saat dimuat",
      "kind": "text-equals", "selector": "#cart-total-display", "expected": "¥0" }
  ],
  "actions": [
    { "id": "cart-add", "label": "klik + Tambah → total bertambah sebesar harga",
      "kind": "click-then-text", "click": ".add-service-btn[data-id=\"photowalk\"]",
      "selector": "#cart-total-display", "expected": "¥12.000" }
  ]
}
```

Kind yang tersedia: `text-equals`, `text-contains`, `count`, `exists`,
`attr-equals`, `click-then-text`, `click-then-count`, `click-then-attr`. Kontrak dibaca
`parseBehaviorContract` dan dijalankan `probeBehavior` tiap iterasi —
hasilnya findings gate (`behavior` / `probe-gagal`). Probe yang gagal
jalan (timeout, elemen tak ditemukan) = finding `probe-gagal`, bukan
crash loop.

**Kontrak ini WAJIB — bukan opsional, dan tidak bisa dilewati.** Bila Maker
tidak menulis kontrak, gate MENURUNKAN kontrak default otomatis dari DOM
(`deriveDefaultContract`: keranjang kosong saat dimuat, klik tambah = tepat
1 item, filter menyaring, form kosong = error muncul, toggle ganti state —
hanya yang bisa diturunkan dengan keyakinan tinggi) dan probe TETAP jalan
tiap iterasi. Bila tidak ada satu pun check yang bisa diturunkan, gate
memberi finding warn "tidak ada interaksi yang bisa diprobe" — bukan skip
diam-diam — dan DONE tetap butuh kontrak eksplisit dari Maker. **Tidak ada
DONE tanpa behavior probe yang berjalan DAN lolos.** (Pelajaran v0.3.32:
loop Kopi Senja Minecraft 5 iterasi lolos gate deterministik 0 findings
sementara bug double-add Rp36.000 bertahan — karena DESIGN.md tanpa
kontrak dan behavior gate v0.3.31 hanya jalan "bila ada kontrak".)

Lalu, Maker wajib menyebutkan **3 jebakan AI-slop yang paling mungkin
bikin halaman itu gagal** — spesifik untuk halaman itu, bukan generik.
Contoh: "bahaya gradien ungu generik, tabel dashboard terlalu sempit di
HP, tombol aksi tidak kelihatan".

Lalu, untuk tiap jebakan, ambil **komponen nyata dari skill `design-assets`**
(shadcn, ReUI, Watermelon UI, Astryx, …) yang mencegahnya dari awal.
Komponen karangan dilarang: yang dipakai harus benar-benar ter-fetch dari
sumbernya (lihat `design-assets` § "verify"). Pre-mortem ini adalah jangkar
niat desain — kritikus tidak boleh menyerang niat yang sudah disetujui
Fahmi (mis. lavender lembut + maskot MotionSense) seolah itu cacat.

**Konsultasi modern-web-guidance (MWG) SEBELUM coding (oleh Maker).**

Design-Gate mengukur *hasil* (kontras, tap target, overflow), tapi tidak
tahu *cara* modern memperbaikinya — Maker yang menebak dari bobot training
akan mengulang pola legacy (persis masalah yang dinyatakan
modern-web-guidance di README-nya: data training berisi pola legacy dalam
jumlah besar). Sebelum menulis kode, untuk tiap kemampuan yang dibutuhkan
halaman itu (progress bar, form, navigasi, dsb.), Maker WAJIB berkonsultasi
ke modern-web-guidance (GoogleChrome — panduan web modern + status Baseline
+ strategi fallback) mengikuti 4 langkah ini:

1. **Search** — `node harness/mwg-consult.mjs search "<kemampuan 2–5 kata>"`
   (mis. `search "progress determinate"`). Mengembalikan ID panduan.
2. **Retrieve** — `node harness/mwg-consult.mjs retrieve <id[,id...]>`
   (atau `consult "<query>"` untuk search + retrieve sekaligus, maks 3
   panduan). CLI MWG menyimpan panduan ke file sementara dan mencetak
   lokasinya — baca file itu dengan file tool, jangan `cat`/`head`.
   Jangan panggil `npx` langsung: helper menjalankan persis
   `npx -y modern-web-guidance@latest ...` (dengan `-y`, tanpa prompt).
   `npx` telanjang / tanpa `-y` / paket lain DILARANG.
3. **Verify** — terapkan panduan itu, lalu periksa implementasi terhadap
   panduan sebelum selesai (langkah verifikasi MWG).
4. **Disclose** — tulis seksi `### Modern Web Guidance` di `DESIGN.md`:
   ID + nama tiap panduan yang dipakai dan jebakan yang dihindari.

**Fallback offline (bukan gagal):** bila CLI MWG tidak tersedia (tanpa
jaringan, `npx` tidak ada, timeout) helper mengembalikan fallback —
Maker lanjut dengan perilaku sekarang (tanpa MWG) dan mencatat
`source: "fallback"` di penanda loop. Loop TIDAK PERNAH gagal hanya
karena MWG tidak tersedia. **Tidak ada file MWG yang diimpor ke repo** —
konsultasi runtime saja; jangan salin SKILL.md/panduan MWG ke mana pun
di repo.

**Penanda pengukuran:** tiap iterasi dicatat ke `loop-history.jsonl`
(`recordLoopIteration`) beserta penanda MWG — `mwg: { consulted:
true/false, guides: ["progress"], source: "cli"|"fallback" }` — supaya
hasil dengan dan tanpa MWG bisa dibandingkan (findings per iterasi).

## 2 — Loop

| Langkah | Yang dilakukan |
|---|---|
| 1. Maker bangun | Sektor agent pemilik skill desain itu: desain UI = coding (`design-taste-frontend`, `impeccable`, `hallmark`, `ui-ux-pro-max`, `stitch-ui`); motion/video = media (`motion-design`, `review-loop`, `web-sims`). Per iterasi router pilih **≤5 skill** yang relevan buat iterasi itu; set-nya boleh ganti antar iterasi. Tidak pernah >5 dalam satu konteks. |
| 2. Render | Figcraft export (desain Figcraft, `figcraft-cli export`) atau screenshot browser (web, via `.opencode/skills/design-taste-frontend/scripts/inspect.mjs` / playwright / chromedev). Dua renderer, satu gate: desain yang sama harus dapat vonis yang sama dari renderer mana pun. **Mode input situs live (v0.3.36 §5):** untuk mendesain ulang situs yang sudah tayang, simpan dulu salinannya dengan `node harness/design-snapshot.mjs <url\|file> <out.html> [--dark\|--light] [--width 1440]` — menyimpan HTML halaman + screenshot `<out>.live.png`, scroll dulu agar lazy-load ketangkap. **Caveat:** background animasi dari script tidak selamat — hasil snapshot adalah salinan statis; perilaku dibangun ulang dari kontrak. **File sementara/scratch SELALU di dalam workspace (`<workspace>/.tmp/` atau subdir tugas), JANGAN `/tmp`** — guard menolak `rm` di luar workspace. |
| 3. Gate ukur | `harness/design-gate.mjs` + Design Stress-Test: viewport ekstrem 1440/768/390 (overflow, elemen bertumpuk, teks terpotong), edge-case data & teks (teks sangat panjang, empty state, loading, error, data tidak konsisten = finding), aksesibilitas (rasio kontras dihitung dari piksel, minimal 4,5:1 WCAG AA; tombol sentuh <44px langsung gagal; font/gambar gagal muat — gambar yang gagal di browser dicek HTTP-nya dulu: 200 + byte gambar valid = warn artefak lingkungan, bukan fail), kesetiaan token (warna render vs token DESIGN.md — solid di luar token = finding bernama + bersaran), anti-slop `purple-gradient`: gagal hanya bila SATU gradien mengandung stop ungu DAN stop cyan/biru (AND, v0.3.33 — gradien ungu murni kini lolos; dulu OR), proporsi aksen (warn bila aksen >10% luas terukur, fail bila >25%) dan banned-palette krim + terracotta (fail, kecuali pengecualian merek yang dicatat di DESIGN.md) — keduanya diimplementasi di `harness/design-gate.mjs`, bukan di skill ini — ditambah kepadatan ruang (space-density): warn bila ruang kosong terukur <10% viewport, advisory saja dan tidak pernah menggagalkan gate (juga diimplementasi di `harness/design-gate.mjs`, bukan di skill ini) — due diligence (aksesibilitas, lisensi aset, konsistensi data). **Tiap iterasi juga menjalankan behavior gate — SELALU, tidak bisa dilewati**: `probeBehavior` menjalankan kontrak interaksi dari `DESIGN.md` (keadaan awal + hasil klik); bila tidak ada kontrak, gate menurunkan kontrak default otomatis dari DOM (`deriveDefaultContract`) dan probe tetap jalan; bila tidak ada check yang bisa diturunkan, hasilnya finding warn "tidak ada interaksi yang bisa diprobe" — bukan skip diam-diam. Hasilnya findings `behavior`/`probe-gagal` yang ikut menentukan vonis gate. Jumlah findings tiap iterasi dicatat ke `<workspace>/.tmp/loopdesign/loop-history.jsonl` (`recordLoopIteration`, beserta penanda MWG `mwg: { consulted, guides, source }` — lihat §1) untuk aturan mentok (§4). |
| 4. Kritikus menyerang | §3 — red team + pairwise (iterasi sekarang vs sebelumnya, dua urutan presentasi). Pairwise MENGINFORMASIKAN, never-gate. |
| 5. Maker perbaiki | Dari findings gate + kritik. Perbaiki dalam **9 pass
berurutan** (v0.3.36, diadaptasi dari unslop — instruksi Maker, BUKAN
aturan gate; gate tidak memeriksa urutan pass): **spacing → color →
icons → copy → type → layout → details → visuals → motion**. Selesaikan
satu pass menyeluruh sebelum pass berikutnya. Spacing dulu karena
satu pass menyeluruh sebelum pass berikutnya. Spacing dulu karena
semuanya terbaca berbeda begitu ritmenya benar. Copy sebelum type/layout
karena panjang headline menentukan ukuran dan letaknya. Visuals + motion
terakhir karena harus muat di layar yang sudah jalan tanpanya. Bila
findings gate menyangkut pola web modern (kontras, tap target, progress,
form, dsb.), konsultasi ulang MWG untuk kategori itu (4 langkah di §1)
sebelum memperbaiki — jangan menebak pola dari bobot training. Lalu
kembali ke langkah 2. |

## 3 — Kritikus Red-Team / Devil's Advocate (sub-agent terpisah)

Input kritikus: screenshot + hasil ukur gate + brief/token (arah + token +
ringkasan brief/data dari DESIGN.md) + hasil probe perilaku (`behavior` di
`criticInput`) + arah yang dideklarasikan Maker (`direction` di
`criticInput`: nama arah + Karakter + Dunia + Momen + Signature + Rasa +
Palet + Ruang dari `parseDesignFile` — v0.3.36 §1, Rasa + Palet ditambah
v0.3.80, Ruang ditambah v0.3.81 (diimplementasi di `criticInput`) —
supaya kritikus menilai kesetiaan iterasi
pada arah, bukan sekadar "terlihat bagus"). Urutan kerjanya:

1. **Steelmanning — duluan, sebelum menyerang.** Nyatakan dulu versi terkuat
   desain ini ("lavender lembut, maskot lucu, pengalaman rekam yang tenang").
   Pengaman supaya kritikus tidak menghantam orang-orangan — misalnya
   mengkritik maskot karena "kekanak-kanakan" padahal lucu itu memang niatnya.
2. **Red teaming.** Cari kegagalan terburuk: "di mana desain ini paling
   jelek?" Bukan menilai rata-rata — merusak desain.
3. **Devil's advocate.** Bela posisi berlawanan dari keputusan Maker:
   "lavender terlalu lembut, kelihatan tidak serius; maskot mengalihkan
   perhatian dari timer." Maker harus membela atau mengubah.
4. **Pre-mortem (kritikus).** Bayangkan desain sudah GAGAL, lalu cari
   penyebabnya: "panel sidang menolak karena timer tidak terbaca di bawah
   matahari → pengguna ketinggalan rekaman → data hilang." Tiap kegagalan
   ditelusur ke satu keputusan desain spesifik.
5. **Peer review.** Kritikus bukan satu suara: `design-taste-frontend`,
   `impeccable`, `hallmark` masing-masing meninjau dari rubriknya sendiri.
   Ini pemakaian alami cap ≤5 — para peer itu skill yang di-routing per
   iterasi.
6. **Pairwise (iterasi sekarang vs sebelumnya).** Kritikus membandingkan
   kandidat secara pairwise — bukan menilai satu gambar sendirian. Harness
   (`harness/design-pairwise.mjs`, `comparePairwise`) mengukur kedua
   kandidat (gate + behavior — kontrak Maker, atau kontrak default turunan DOM
   bila tidak ada kontrak — + ringkasan DOM: bounding box
   + computed styles) dan menyusun packet kritikus dalam DUA urutan
   presentasi (A-lalu-B dan B-lalu-A) plus skor checklist biner per tugas
   (satu item per kategori gate + total findings — kandidat menang item bila
   findings fail-nya di kategori itu lebih sedikit). Kritikus meninjau
   kedua urutan; pemenang harus sama di keduanya, kalau tidak hasilnya
   tie (inkonsisten — jangan dipakai). **Hasil pairwise MENGINFORMASIKAN
   Maker kandidat mana yang lebih baik dan di mana — tidak pernah mengubah
   vonis lolos/gagal gate.** Vonis tetap milik gate deterministik +
   behavior gate.
7. **Checklist warna (advisory, bukan gate).** Kritikus memakai
   `references/color-feel.md` + Rasa dan Palet di DESIGN.md, dan menjawab
   tujuh ini — semuanya advisory, tidak pernah mengubah vonis gate:
   (1) aksen ≤10%? (2) ada keluarga terlarang (krim + terracotta,
   violet/indigo) tanpa pengecualian merek? (3) palet cocok dengan Rasa
   + Karakter? (4) ganti ground antar-section terasa seperti bab atau
   tempelan? (5) satu elemen terang + chrome diam? (6) foto membawa
   warna atau interface netral? (7) tiap field punya ink sendiri, bukan
   `--muted` di atas field berwarna?
8. **Checklist space (advisory, bukan gate).** Kritikus memakai
   `references/space.md` + Ruang di DESIGN.md, dan menjawab empat ini —
   semuanya advisory, tidak pernah mengubah vonis gate:
   (1) ada area kosong yang disengaja? (2) ada elemen yang bisa
   dikurangi tanpa kehilangan Momen? (3) satu hal utama per layar?
   (4) layout terasa sesak seperti poster AI?

### Golden — kritik berjangkar referensi (v0.3.32 §2)

Golden = render referensi untuk keluarga brief yang sama: screenshot yang
sudah disetujui + `DESIGN.md`/token + ringkasan brief, disimpan di workspace
tugas sebagai `goldens/<nama>/` (mis. `goldens/kopi-senja/` berisi
`screenshot.png`, `DESIGN.md`, `brief.json`).

**Cara menyediakan golden:** minta Maker/pengguna satu screenshot referensi
(desain yang sudah disetujui, mockup klien, atau halaman acuan) + arah dan
tokennya, simpan apa adanya di `goldens/<nama>/`. Golden dibaca dengan
`loadGolden()` (`harness/design-golden.mjs`) dan dikirim ke kritikus lewat
field `golden` di `criticInput()` — kritikus membandingkan iterasi saat ini
vs golden (layout, densitas, hierarki, kesetiaan arah) dan melaporkan
divergensi sebagai temuan advisory. Pakai saat brief berulang / keluarga
desain yang sama, supaya halaman berikutnya terasa satu keluarga dengan
halaman yang sudah disetujui.

**Batasnya (jangan dilanggar):**
- Golden **MENGINFORMASIKAN, NEVER-GATE** — divergensi vs golden tidak
  pernah mengubah vonis gate (`evaluateDesign` tidak membaca golden).
- Golden **wajib dari referensi tepercaya, BUKAN dari output loop sendiri**
  (bukan iterasi sebelumnya, bukan render yang dibuat loopdesign) — itu
  self-referential dan tidak valid: loop akan menilai dirinya sendiri bagus.
- Golden yang salah = patokan yang salah: golden usang (brief berubah) atau
  dari keluarga brief lain akan menyesatkan kritikus.
- Golden tanpa screenshot atau tanpa arah/token = tidak valid — `loadGolden`
  throw, jangan diam-diam lanjut tanpa golden.

## 4 — Aturan berhenti (tidak bisa ditawar)

- **Gate lolos → berhenti.** Sudah bagus, tidak perlu lanjut.
- **Tidak ada DONE tanpa behavior probe lolos.** "Gate lolos" berarti lolos
  TERMASUK behavior probe (kontrak eksplisit Maker, atau kontrak default
  turunan DOM bila tidak ada kontrak). Gate deterministik 0 findings tapi
  behavior belum jalan = belum DONE.
- **Iterasi tanpa perbaikan → berhenti, meski N belum habis.** Skor gate sama
  atau turun = RuntimeSpin: pengulangan tanpa progres = spin.
- **Mentok → berhenti + vonis.** Jumlah findings tidak berkurang 2 iterasi
  berturut-turut → loop berhenti dengan vonis "mentok di N findings" +
  daftar findings yang tersisa — bukan menghabiskan budget N
  (`checkStuck` / `stuckVerdict` atas `loop-history.jsonl`).
- **N habis → berhenti + laporkan findings yang tersisa.**
- **3 iterasi GAGAL berturut-turut → orchestrator berhenti, tanya Fahmi,
  sebut premis yang diserang** (aturan 6 orchestrator yang sudah ada).

N adalah batas atas dari user, bukan janji N iterasi penuh. Minta 10 tapi
iterasi ke-4 sudah lolos → berhenti di 4. Sintaks: `/loopdesign [N]`,
default N = 3.

## Delegasi — jangan mengajari ulang

| Topik | Delegasi ke |
|---|---|
| Komponen jadi, aset desain, token, inspirasi | `design-assets` |
| Instalasi tool/CLI (npm, Figcraft, playwright) | `external-tools` |
| Rebuild deterministik dari desain Figcraft | `figcraft` (MCP, off by default, `LUMI_MCP=...,figcraft`) |
| Kualitas visual, anti-slop, arah artistik | `design-taste-frontend`, `impeccable`, `hallmark` |
| Motion / simulasi interaktif | `motion-design`, `web-sims` |
| Screenshot + inspeksi browser | `design-taste-frontend/scripts/inspect.mjs` |
| Panduan web modern (Baseline + fallback) | `modern-web-guidance` — konsultasi runtime via `harness/mwg-consult.mjs`, BUKAN skill impor |
| Cara berpikir warna (rasa → palet, 60-30-10, keluarga terlarang) | `references/color-feel.md` di loopdesign |
| Cara berpikir space (negative space, kurangi dulu) | `references/space.md` di loopdesign |

## Guardrails

- Jangan panggil semua skill desain sekaligus — melanggar cap ≤5, konteks
  jebol. Yang benar: ≤5 per iterasi, set boleh berganti antar iterasi.
- Jangan tambah skill desain lagi sebagai fix — premisnya sudah gagal
  (20+ skill, output tetap slop). Fix-nya loop + retrieval, bukan jumlah skill.
- Jangan ubah build jadi fokus desain — build = agent bawaan OpenCode,
  bukan kode Lumitome.
- Bukti masuk jurnal JSONL yang sama dengan done-gate (pass + findings),
  seperti `design-gate.mjs` menulisnya.
