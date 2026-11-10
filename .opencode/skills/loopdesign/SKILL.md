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
- **Maker ≠ kritikus.** Kritikus adalah sub-agent terpisah (depth 1, konteks
  sendiri). Ia menerima screenshot + hasil ukur gate + brief/token — tidak pernah
  melihat kode atau klaim Maker. Maker yang menilai dirinya sendiri batal.
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
Token:
- #RRGGBB — <peran, mis. kopi (teks/heading)>
- ... (4–6 hex)
Netral:
- --text-muted: tint #RRGGBB 60%
- --border: tint #RRGGBB 15%
Tipografi: <font display> (display), <font body> (body)
Signature: <satu elemen signature>
```

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

## 2 — Loop

| Langkah | Yang dilakukan |
|---|---|
| 1. Maker bangun | Sektor agent pemilik skill desain itu: desain UI = coding (`design-taste-frontend`, `impeccable`, `hallmark`, `ui-ux-pro-max`, `stitch-ui`); motion/video = media (`motion-design`, `review-loop`, `web-sims`). Per iterasi router pilih **≤5 skill** yang relevan buat iterasi itu; set-nya boleh ganti antar iterasi. Tidak pernah >5 dalam satu konteks. |
| 2. Render | Figcraft export (desain Figcraft, `figcraft-cli export`) atau screenshot browser (web, via `.opencode/skills/design-taste-frontend/scripts/inspect.mjs` / playwright / chromedev). Dua renderer, satu gate: desain yang sama harus dapat vonis yang sama dari renderer mana pun. **Mode input situs live (v0.3.36 §5):** untuk mendesain ulang situs yang sudah tayang, simpan dulu salinannya dengan `node harness/design-snapshot.mjs <url\|file> <out.html> [--dark\|--light] [--width 1440]` — menyimpan HTML halaman + screenshot `<out>.live.png`, scroll dulu agar lazy-load ketangkap. **Caveat:** background animasi dari script tidak selamat — hasil snapshot adalah salinan statis; perilaku dibangun ulang dari kontrak. **File sementara/scratch SELALU di dalam workspace (`<workspace>/.tmp/` atau subdir tugas), JANGAN `/tmp`** — guard menolak `rm` di luar workspace. |
| 3. Gate ukur | `harness/design-gate.mjs` + Design Stress-Test: viewport ekstrem 1440/768/390 (overflow, elemen bertumpuk, teks terpotong), edge-case data & teks (teks sangat panjang, empty state, loading, error, data tidak konsisten = finding), aksesibilitas (rasio kontras dihitung dari piksel, minimal 4,5:1 WCAG AA; tombol sentuh <44px langsung gagal; font/gambar gagal muat — gambar yang gagal di browser dicek HTTP-nya dulu: 200 + byte gambar valid = warn artefak lingkungan, bukan fail), kesetiaan token (warna render vs token DESIGN.md — solid di luar token = finding bernama + bersaran), anti-slop `purple-gradient`: gagal hanya bila SATU gradien mengandung stop ungu DAN stop cyan/biru (AND, v0.3.33 — gradien ungu murni kini lolos; dulu OR), due diligence (aksesibilitas, lisensi aset, konsistensi data). **Tiap iterasi juga menjalankan behavior gate — SELALU, tidak bisa dilewati**: `probeBehavior` menjalankan kontrak interaksi dari `DESIGN.md` (keadaan awal + hasil klik); bila tidak ada kontrak, gate menurunkan kontrak default otomatis dari DOM (`deriveDefaultContract`) dan probe tetap jalan; bila tidak ada check yang bisa diturunkan, hasilnya finding warn "tidak ada interaksi yang bisa diprobe" — bukan skip diam-diam. Hasilnya findings `behavior`/`probe-gagal` yang ikut menentukan vonis gate. Jumlah findings tiap iterasi dicatat ke `<workspace>/.tmp/loopdesign/loop-history.jsonl` (`recordLoopIteration`) untuk aturan mentok (§4). |
| 4. Kritikus menyerang | §3 — red team + pairwise (iterasi sekarang vs sebelumnya, dua urutan presentasi). Pairwise MENGINFORMASIKAN, never-gate. |
| 5. Maker perbaiki | Dari findings gate + kritik. Perbaiki dalam **9 pass
berurutan** (v0.3.36, diadaptasi dari unslop — instruksi Maker, BUKAN
aturan gate; gate tidak memeriksa urutan pass): **spacing → color →
icons → copy → type → layout → details → visuals → motion**. Selesaikan
satu pass menyeluruh sebelum pass berikutnya. Spacing dulu karena
semuanya terbaca berbeda begitu ritmenya benar. Copy sebelum type/layout
karena panjang headline menentukan ukuran dan letaknya. Visuals + motion
terakhir karena harus muat di layar yang sudah jalan tanpanya. Lalu
kembali ke langkah 2. |

## 3 — Kritikus Red-Team / Devil's Advocate (sub-agent terpisah)

Input kritikus: screenshot + hasil ukur gate + brief/token (arah + token +
ringkasan brief/data dari DESIGN.md) + hasil probe perilaku (`behavior` di
`criticInput`) + arah yang dideklarasikan Maker (`direction` di
`criticInput`: nama arah + Karakter + Dunia + Momen + Signature dari
`parseDesignFile` — v0.3.36 §1, supaya kritikus menilai kesetiaan iterasi
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

## Guardrails

- Jangan panggil semua skill desain sekaligus — melanggar cap ≤5, konteks
  jebol. Yang benar: ≤5 per iterasi, set boleh berganti antar iterasi.
- Jangan tambah skill desain lagi sebagai fix — premisnya sudah gagal
  (20+ skill, output tetap slop). Fix-nya loop + retrieval, bukan jumlah skill.
- Jangan ubah build jadi fokus desain — build = agent bawaan OpenCode,
  bukan kode Lumitome.
- Bukti masuk jurnal JSONL yang sama dengan done-gate (pass + findings),
  seperti `design-gate.mjs` menulisnya.
