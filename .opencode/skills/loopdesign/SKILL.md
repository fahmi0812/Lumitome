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
  vonis lolos/gagal. Kritikus memberi pendapat; gate memberi vonis.
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
Token:
- #RRGGBB — <peran, mis. kopi (teks/heading)>
- ... (4–6 hex)
Tipografi: <font display> (display), <font body> (body)
Signature: <satu elemen signature>
```

`DESIGN.md` adalah source of truth: **Maker hanya memakai token deklarasi
di CSS — tidak ada raw hex di luar DESIGN.md.** Warna di luar token =
finding `token-fidelity` di gate (fail). Warna merek yang memang dibutuhkan
(mis. hijau WhatsApp) harus ikut dideklarasikan sebagai token, bukan
diselipkan diam-diam. Bila brief tidak memberi token, Maker menetapkan
4–6 token sendiri di DESIGN.md sebelum coding — jangan mulai dari CSS
tanpa arah tertulis.

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
| 2. Render | Figcraft export (desain Figcraft, `figcraft-cli export`) atau screenshot browser (web, via `.opencode/skills/design-taste-frontend/scripts/inspect.mjs` / playwright / chromedev). Dua renderer, satu gate: desain yang sama harus dapat vonis yang sama dari renderer mana pun. **File sementara/scratch SELALU di dalam workspace (`<workspace>/.tmp/` atau subdir tugas), JANGAN `/tmp`** — guard menolak `rm` di luar workspace. |
| 3. Gate ukur | `harness/design-gate.mjs` + Design Stress-Test: viewport ekstrem 1440/768/390 (overflow, elemen bertumpuk, teks terpotong), edge-case data & teks (teks sangat panjang, empty state, loading, error, data tidak konsisten = finding), aksesibilitas (rasio kontras dihitung dari piksel, minimal 4,5:1 WCAG AA; tombol sentuh <44px langsung gagal; font/gambar gagal muat), kesetiaan token (warna render vs token DESIGN.md — solid di luar token = finding), due diligence (aksesibilitas, lisensi aset, konsistensi data). |
| 4. Kritikus menyerang | §3. |
| 5. Maker perbaiki | Dari findings gate + kritik. Lalu kembali ke langkah 2. |

## 3 — Kritikus Red-Team / Devil's Advocate (sub-agent terpisah)

Input kritikus: screenshot + hasil ukur gate + brief/token (arah + token +
ringkasan brief/data dari DESIGN.md). Urutan kerjanya:

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

## 4 — Aturan berhenti (tidak bisa ditawar)

- **Gate lolos → berhenti.** Sudah bagus, tidak perlu lanjut.
- **Iterasi tanpa perbaikan → berhenti, meski N belum habis.** Skor gate sama
  atau turun = RuntimeSpin: pengulangan tanpa progres = spin.
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
