# Doc-Code Drift — v0.1.1

Rule global: `.opencode/rules/00-doc-code-drift.md` (orchestrator + sektor coding, security; finance/media bila menyentuh kode). Modul: `harness/doc-drift.ts`.

## Referensi
Xiaonan Xu (Georgia Tech) & Wenjing Wu (CU Boulder), *Stale Instruction Files Override the Code in Coding Agents: A One-Sentence Fix*, arXiv:2610.30571 — https://arxiv.org/abs/2610.30571 (diangkat oleh @ai_database: https://x.com/ai_database/status/2114184481951330365).

Angka yang diverifikasi dari abstrak/isi makalah: 40 proyek Python sintetis, Claude Code + Codex CLI, 320 run. Tanpa kalimat: 90,1% pilihan (649/720) mengikuti file instruksi basi, 4,2% mengikuti kode; Claude Code menyebut konflik di 79/80 run namun tetap mengikuti file; Codex CLI menulis ulang kode di 20/80 run dan tes proyek gagal di 17 di antaranya. Dengan kalimat: 91,4% (658/720) mengikuti kode, tanpa rewrite, tingkat lulus tes 89,4% → 100%. Batasan menurut makalah: hanya proyek Python sintetis, dua agen.

Kalimat verbatim (dari makalah):
> When a repository's documentation and its existing code disagree, follow the conventions used in the existing code, and in your final reply point out each inconsistency you found between the documentation and the code.

## Adaptasi Swanwright
1. Prioritas: instruksi eksplisit user di tugas ini > kode/tes yang ada > dokumen repo/AGENTS.md.
2. Rule keamanan (bwrap, larangan push ke main, consent+scope pentest, Done-Gate) tidak bisa ditimpa kode.
3. Inkonsistensi → `FACT: drift <doc>:<baris> vs <kode>:<baris> — ...` di bagian **Doc-Code Drift** (`DoneGateInput.docCodeDrift`, `driftSection()`).
4. Kode lulus tes yang ditulis ulang demi dokumen (`passingBefore` + `changeReasons`) → WARN `doc-drift:` (bukan blok).
5. AGENTS.md dan `.opencode/rules/*` Swanwright sendiri bisa basi — diberi catatan.

## Deteksi deterministik (heuristik)
Pasangan: print↔logging, os.path↔pathlib, f-string↔str.format, impor relatif↔absolut. Fixture: `tests/fixtures/drift/proj`. Heuristik ini tidak lengkap; drift lain tetap wajib dilaporkan agen secara manual.
