# PRD — Lumitome 0.3.47

> Dokumen ini ditulis ulang di v0.3.47 (P2-2) karena PRD lama ("Swanwright
> 0.1.0", 54 baris) sudah tidak cocok dengan repo: maks 3 skill, target indeks
> 3k token, roadmap era v0.1.0, dan fiksi branch+PR. Setiap angka di bawah ini
> bisa ditelusur ke pengukuran (`npm run skills:metrics`,
> `runtime/metrics.json`) atau file sumber yang disebut. Nama lama
> Swanwright masih muncul di path internal (`.swanwright/`, plugin
> `swanwright.ts`) — itu peninggalan, bukan nama produk.

## Latar
Lumitome: asisten coding terminal di atas OpenCode 2.2.4 (vanilla, tanpa patch
core). Model hanya via 9router; tanpa LiteLLM / proxy lain. Satu registry
900 skill (734 bisa ter-route; 166 pack red-team tetap disabled), routing
2 lapis + lazy-load.

## Tujuan
Harness agen yang efisien (token), efektif (done-gate berbukti), dan
orchestrator tipis dengan 6 sektor (+ `misc` sebagai keranjang) + skill lazy.

## Non-goal
- Design bank (nexu-io/open-design dan sejenis) — ditolak.
- LiteLLM / proxy selain 9router.
- Patch core OpenCode.
- Push/tag/rilis otomatis tanpa verifikasi dan persetujuan manusia
  (skrip rilis tidak pernah commit/tag/push sendiri — lihat Praktik rilis).
- Vendoring skill berlisensi proprietary / Commons Clause tanpa izin.
- Mengimpor file skill mattpocock/pstack ke repo — skill itu dipakai sebagai
  **cara berpikir** (TDD + investigasi), BUKAN diimpor
  (koreksi Fahmi 11 Nov 2026).

## Persona
Fahmi (pemilik). EnMiChan (kontributor) mengeksekusi dan mengirim perubahan;
Fahmi review dan menyetujui.

## Praktik rilis (keputusan v0.3.47, eksplisit)
**Praktik yang benar-benar berjalan: push langsung ke `main` oleh kontributor
(EnMiChan) setelah verifikasi (validate + suite + scan hijau) dan kartu
persetujuan push dari Fahmi — BUKAN branch+PR.** Alur: `node
scripts/bump-version.mjs <x.y.z> "<judul>"` → isi CHANGELOG → `npm run
validate` + suite penuh + `npm run scan` → commit + tag + GitHub Release
(`scripts/release.mjs` hanya memverifikasi dan menyiapkan; ia TIDAK PERNAH
commit/tag/push — pengiriman lewat snapshot-push koordinator, keputusan akhir
tetap manusia).
> Ketegangan yang dicatat jujur: `AGENTS.md` repo masih menulis "Perubahan
> arsitektur/harness tetap via PR (Fahmi yang buka PR)". Aturan itu BELUM
> diubah dan TIDAK dihapus diam-diam di slice ini — tapi ia bertentangan
> dengan praktik di atas (slice arsitektur/harness P0–P2 selama ini
> dikirim push langsung ke main dengan kartu persetujuan). Sampai Fahmi
> mengubah salah satu sisi, PRD ini mencatat praktik yang berjalan dan
> menandai ketegangannya, agar tidak ada dokumen yang pura-pura cocok.

## Requirement fungsional
1. Routing 2 lapis (Layer-0 regex 0-token, Layer-1 1x 9router) + maks 5 skill + lazy-load.
2. Peran: orchestrator tipis, elephant, executor sektor (bwrap), goldfish (kompleks/release), verifier, synthesizer.
3. Done-gate FACT/JUDGMENT; UNRUN≠PASS; anti-spin max 3.
4. Satu korpus (sejak v0.3.27): skill pack non-red-team ter-route seperti skill aktif; tidak ada lagi status dormant/pack. `npm run enable-pack -- <pack>` hanya menyalin pack ke `.opencode/skills` agar OpenCode memuatnya sebagai skill native (opsional; `--disable` mencabut salinannya). Pack red-team (166 skill) tetap disabled dari routing.
5. `/correct` → tes/rule permanen.
6. `/pentest` wajib consent+scope.
7. Konsistensi versi single-source (sejak v0.3.21, ditegakkan validate sejak v0.3.47): file `VERSION` kanonik; `package.json`/lockfile/README/CHANGELOG harus cocok — `scripts/version-check.mjs`, gagal bila ada yang basi atau CHANGELOG masih placeholder.

## Non-fungsional
- Node ≥ 22.6 (`package.json` engines). Indeks aktif ≤ 22.400 token (estimasi chars/4; terukur 17.735 token pada 734 entri, v0.3.46 — cap per seksi di `router/index-budgets.mjs`, total 22.400). Target lama ≤ ~3k token sudah tidak berlaku sejak katalog tumbuh ke 734 skill dan dicabut di v0.3.46. Estimasi len/4 diketahui kasar (terutama teks Indonesia/kode) — kalibrasi terhadap tokenizer nyata masih langkah berikut.
- Orchestrator ≤ 600 token (terukur ~596, validate).
- Single-writer progress files.

## Metrik sukses
| Metrik | Target | Terukur (v0.3.46, diukur ulang v0.3.47 — sama) |
|---|---|---|
| Token prompt indeks aktif | ≤ 22.400 | 17.735 pada 734 entri (`npm run skills:metrics` / validate) |
| Routing top-1 sektor | ≥ 95% pada golden ≥ 120 | Belum ada pengukuran per-sektor di `skills:metrics` — langkah berikut |
| Top-1 skill (golden 154, BM25-only tanpa L1) | — (tanpa target baru; target lama ≥ 95% di atas adalah per-sektor) | 0,8304 |
| Recall@5 skill | ≥ 90% | 1,0 (any) / 0,8255 (fraksi) |
| Held-out 24 kasus prompt natural (tidak dipakai tuning) | — | top-1 0,8333, recall@5 1,0, MRR 0,9028 |
| Done-gate false-positive | 0 pada set eval | — (target; tidak ada set eval bernomor di repo) |
| Token/tugas vs SQAGI 0.2.2 | −30% | Belum diukur |

Sumber angka: `npm run skills:metrics` (golden 154, L0-mismatch 0) dan
`node scripts/skill-metrics.mjs --golden tests/golden-routing-heldout.json`
(24 kasus); ringkasannya di `runtime/metrics.json`. Latensi retrieval
p50 ~0,92 ms / p95 ~3,93 ms (ber-noise antar-run).

## Risiko & mitigasi
- Lisensi upstream: pin SHA; proprietary/Commons Clause = pointer saja.
- Keamanan pentest: consent+scope; C2 di profil mati.
- Upstream drift: `scripts/sync-upstream` re-fetch SHA pin.
- Drift dokumen: `npm run validate` menegakkan konsistensi versi +
  hitungan skill aktif dinamis (tanpa hardcode); `harness/doc-drift.ts`
  mendeteksi konvensi dokumen vs kode + drift versi (cakupan penuh metrik
  prosa masih langkah berikut).
- Git lokal tertinggal: working copy disinkronkan koordinator ke HEAD remote
  tiap push (HEAD 76eccef = remote HEAD saat v0.3.47 ditulis).

## Status (v0.3.47) & langkah berikut
- P0–P1 selesai (v0.3.39–v0.3.45, lihat CHANGELOG). P2 berjalan: P2-1 ukur
  ulang routing + TTL cache (v0.3.46); P2-2 bereskan drift dokumen & proses
  (v0.3.47, dokumen ini).
- Yang masih langkah berikut: (1) kalibrasi estimasi token len/4 terhadap
  tokenizer nyata; (2) pengukuran top-1 per-sektor (target ≥ 95% di atas
  belum bisa dinilai); (3) held-out yang masih bukan top-1 (systematic-debugging
  rank 3, tdd-red-green-refactor rank 3, stitch-ui rank 2, analisis-laporan-keuangan
  rank 2); (4) pelebaran sektor hanya menangkap ~50% kasus sektor-salah;
  (5) doc-drift cakupan penuh — angka/metrik di prosa dokumen (mis. judul
  dan angka di `docs/SKILLS-CATALOG.md`, `docs/ROUTING.md`) belum dicek
  otomatis; (6) keputusan ketegangan AGENTS.md vs praktik rilis (lihat di atas)
  masih menunggu Fahmi.

## Keputusan default (bisa diubah)
1. 6 sektor (gamedev = pack) + `misc` sebagai keranjang.
2. Goldfish hanya kompleks/release.
3. OmO = pola saja, jangan vendor.
4. Skill mattpocock/pstack = cara berpikir, BUKAN diimpor; port pola (bukan file skill) bila perlu, lisensi dihormati (koreksi 11 Nov 2026 atas "Port pstack (MIT)" yang lama).
5. Model 2 tier via 9router.
