# Eval harness peran /subagent (v0.3.73, P4 fullcheck)

Pengukur kualitas delegasi /subagent yang bisa diulang — angka, bukan kesan.
Prasyarat semua optimasi lanjutan (Karpathy: evals-driven). Desain mengikuti
protokol **blind forward-test Codex** (laporan CL4R1T4S 2026-11-16): subagent
penguji hanya menerima ARTEFAK, bukan diagnosis.

## Cara pakai

```sh
lumitome role-eval [--task <id|all>] [--home <dir>] [--out <dir>]
                   [--model <id>] [--judge-model <id>] [--no-judge]
                   [--timeout-ms N] [--judge-timeout-ms N]
                   [--mode <label>] [--save-baseline <path>]
                   [--compare-baseline <path>]
lumitome role-eval --list
lumitome role-eval --score <runDir>
```

- Satu run eval = tiap golden task dijalankan headless lewat
  `lumitome run --agent orchestrator -m <Thinking> "<prompt>"` di workspace
  fixture-nya sendiri, lalu dinilai. Exit 0 bila eval selesai ditulis —
  tugas FAIL adalah DATA, bukan kegagalan harness (exit 2 bila harness-nya
  yang gagal: preset tak terbaca, task tak dikenal, out dir tak bisa dibuat).
- `--score <runDir>` menghitung ulang skor dari run tersimpan tanpa model
  (checker dijalankan ulang atas workspace tersimpan).
- Baseline repo: `harness/role-eval-baseline.json` (mock, v0.3.73).
  Bandingkan run baru: `--compare-baseline harness/role-eval-baseline.json`.

## Golden task (3, kecil + cepat — satu run ~30 detik dengan mock)

| id | tugas | yang dicek (deterministik) |
|---|---|---|
| `search-filter` | tambah pencarian + filter kategori ke index.html toko baju | `#cari`, `#filter-kategori`, kategori di 6 produk, logika filter gabungan, fitur lama utuh |
| `add-footer` | tambah footer | `<footer>`, teks copyright persis, tautan "Hubungi kami", konten lama utuh |
| `fix-typo-add-item` | perbaiki typo + tambah produk | typo hilang, nama benar ada, produk baru + harga, jumlah produk 6, produk lama utuh |

Fixture di `harness/role-eval-fixtures/<id>/`. Prompt tiap task memuat marker
`[EVAL-TASK:<id>]` (dipakai mock tes untuk bercabang; model asli mengabaikannya).

## Skor per task

1. **Checker deterministik (utama)** — fungsi murni atas file hasil kerja
   (`harness/role-eval.mjs`: `checkTask`). Lolos/gagal per kriteria.
2. **Blind judge** — satu run `lumitome run` terpisah dengan prompt yang
   HANYA berisi tugas asli + isi artefak + rubrik (`buildJudgePrompt`).
   Tanpa transkrip, tanpa diagnosis Builder/orchestrator, tanpa riwayat cara
   kerja. Jawaban harus satu objek JSON `{"verdict":"PASS"|"FAIL",
   "criteria":{...},"notes":"..."}`; tak terbaca → verdict null (jujur).
   Judge adalah opini kedua — checker yang memutuskan lolos/gagal.
3. **Sensus delegasi** — dari DB sesi engine
   (`$LUMI_HOME/data/opencode/opencode.db`, dibaca
   `harness/role-eval-census.py`, stdlib sqlite3 via python3): sesi anak per
   peran (dari awalan judul `[Thinking]` dst), selesai/tidak, jumlah panggilan
   `subagent` parent. Null bila DB/python3 tak tersedia.
4. **Delegation-rate** — dari `$LUMI_HOME/subagent-metrics.jsonl` (v0.3.70),
   delta selama jendela run task itu saja. Null bila tak ada data.

Agregat (`scoreEval`): tugas lolos, judge lolos + kesepakatan judge↔checker,
delegasi penuh 4 peran, median delegation-rate dari nilai non-null saja
(bila semua null → null, BUKAN 0).

## Fakta operasional headless (terbukti live di VM, 16 Nov 2026)

- `lumitome run` tanpa stdin tertutup MENGGANTUNG (stdin pipe terbuka) —
  semua spawn CLI memakai stdin tertutup.
- Tanpa `--agent orchestrator`, `lumitome run` memakai agent default engine
  ("build") — eval selalu `--agent orchestrator`.
- Sinkron file agent peran (A4, v0.3.71) dilewati untuk `run` — CLI menerapkan
  preset ke file agent SEBELUM run dan mengembalikannya sesudah run
  (try/finally + handler SIGINT/SIGTERM). Bila eval terputus paksa, jalankan
  `lumitome subagent-preset` untuk sinkron ulang.
- Exit code 3 (DONE-GATE FAIL: file berubah tanpa perintah tes di jurnal)
  adalah HASIL yang diharapkan untuk task ubah-file.
- **Hook plugin server v0.3.70 tidak andal di mode headless `run`:**
  snapshot tool orchestrator tetap penuh (12 tool), dan metrik JSONL hanya
  tertulis bila langganan `session.created` menang balapan startup server
  (`shouldEnforce` butuh agent `"orchestrator"` dari peta sesi; agent
  `undefined` → false). Di baseline run6: 0/3 task terukur metriknya; di run4:
  1/3 terukur (100%). Karena itu delegation-rate di mode headless adalah
  best-effort — sensus DB adalah sumber delegasi utama di mode ini.
  Di mode TUI plugin termuat jauh sebelum sesi dibuat, jadi metrik TUI
  tidak kena balapan ini (terbukti di v0.3.70). Eval mode-TUI (driver PTY)
  tetap pekerjaan lanjutan.

## Mock 9router untuk tes (`tests/fixtures/role-eval-mock-9router.mjs`)

Fixture tes, BUKAN produk. Menjawab L1 SELECT-ONLY dengan JSON valid,
title call, alur scripted thinking→search→builder→reviewer per task,
transformasi deterministik per task, dan cabang judge blind (menilai dari
artefak di prompt). Resolusi folder kerja: run terbaru di `EVAL_OUT_BASE`
(dir induk berisi `run1`, `run2`, …) → `EVAL_OUT/<task>/ws` → path
tool-call → `TASK_WS`/cwd. Nyalakan sebelum eval:

```sh
SCRIPTED=1 MOCK_PORT=20128 EVAL_OUT_BASE=<dir-induk-run> \
  node tests/fixtures/role-eval-mock-9router.mjs
```

Lalu `lumitome role-eval --mode mock --out <dir-induk-run>/runN` dengan
`LUMI_HOME` menunjuk home tes yang `providers.json`-nya mengarah ke mock.

## Batasan jujur

- Baseline dari mock 9router — BUKAN model asli; angka dengan model asli
  bisa berbeda. Mock menskrip alur yang sama untuk semua task (model asli
  bisa menyimpang, ragu, atau salah — justru itu yang ingin diukur eval ini).
- Live hanya di engine 2.3.0 (VM). Perilaku di 2.2.4 belum dibuktikan.
- Judge blind tetap model yang sama, bukan manusia — kesepakatannya bukan
  kebenaran mutlak.
- Eval ini mengukur delegasi + hasil akhir, BUKAN kualitas desain/isi
  (itu ranah `/loopdesign` + Critic) dan BUKAN biaya per peran (Stage 3,
  menunggu keputusan Fahmi).
