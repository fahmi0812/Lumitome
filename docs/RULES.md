# Rules Engineering

## Hierarki (piramida terbalik poteto)
1. Kode/tipe/CI (`harness/done-gate.ts`, policy, bwrap)
2. Hooks plugin deterministik
3. `rules/*.md` ringkas
4. Skill (10–40 baris prinsip idealnya; body upstream apa adanya)
5. Review manusia (Fahmi buka PR)

## /correct
Koreksi → tes atau hook bila bisa; else 1 baris rule ber-id+tanggal.

## Anti-pola
Prosa panjang menduplikasi done-gate; rule tanpa enforcement; >3 skill sekaligus; persona berbunga.

## Rule sektor coding (v0.1.1)
`.opencode/rules/06-coding-karpathy.md` (≤150 token) dimuat oleh `.opencode/agents/sectors/coding.md`. Sumber multica-ai/andrej-karpathy-skills @2c606141936f (MIT). Enforcement: done-gate (scan-gate + diff-scope WARN), layer0 kata kunci `karpathy|perubahan bedah|kode minimal|overengineer*` → coding.

## Doc-Code Drift (v0.1.1)
`.opencode/rules/00-doc-code-drift.md` — lihat `docs/DOC-CODE-DRIFT.md` (arXiv:2610.30571). Rule ini sendiri bisa basi; kode/tes menang kecuali rule keamanan.
