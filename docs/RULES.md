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

## Rules inti Lumitome (v0.3.2) — `lumitome/rules/*.md`
Dimuat wrapper dari config dir Lumitome (`$LUMI_HOME/config/rules`, symlink ke instalasi). **Bukan dari proyek**, sehingga aktif di repo mana pun walau trust proyek mati. Agents (`.opencode/agents`) dan commands (`.opencode/commands`) dibawa lewat config dir yang sama.
Budget: always-on ±2.5 KB (≈0.7–0.9k token, < 1.5k). Detail prosedur tetap di skill on-demand (tdd-red-green-refactor, systematic-debugging, root-cause-gate, unified-done-gate, executing-plans, anti-spin-circuit-breaker).
Teks ditulis ulang (parafrase/sintesis), tidak disalin. Sumber dibaca pada SHA berikut:

| Sumber | SHA | Lisensi | Dipakai untuk |
|---|---|---|---|
| multica-ai/andrej-karpathy-skills | 2c606141936f1eeef17fa3043a72095b4765b9c2 | MIT (README) | think-before-coding, simplicity, surgical, goal-driven verify |
| obra/superpowers | 2ce8aa15d05bd57213e6f746f953aafb7ded7a8b | MIT | TDD, root cause dulu, verifikasi sebelum klaim selesai, plan→execute |
| poteto/noodle (brain/principles) | 82d2921c52370f23f29086de81ccfb600939c037 | MIT | prove-it-works, fix-root-causes, never-block-on-the-human, guard-the-context-window, subtract-before-you-add, encode-lessons-in-structure |
| poteto/brainmaxxing | ec4d8e43dee639d6f5d94aed3ca16af7b298ecfc | MIT | (prinsip identik dengan noodle; konfirmasi) |
| poteto/verification-skill-example | d5abe70d0d8c671672b6cef4069363f26c488feb | tanpa lisensi → hanya ide, tanpa teks | verifikasi per fitur, bukti nyata |
| unicodef1wn/grokbot-field-notes | 02780c04ef5f412b28573bce6f82afd15d195d1f | MIT | "verification is the job", reproduce first, restate, kapan berhenti & bertanya |
| qkal/Canny | f2c5e53779445d60dc4a09d2dbced2308fccb820 | MIT | "facts block, judgments note" → FACT vs JUDGMENT |
| affaan-m/ECC (rules/common) | b38be6a7f6350964d59328b52f0624e1d1d552d1 | MIT | KISS/YAGNI, secret hygiene, delegation contract |
| alvinunreal/oh-my-opencode-slim | 5c6655f0b7d36b0e7c1b3e537eedf799ee971102 | MIT | "model-facing bytes are a budget", tanpa duplikasi instruksi tool |
| mattpocock/skills | 4ae2317ddb22b046e26455e4f9c9b3aaaf62212d | MIT | subagent dengan konteks segar |
| google/elephant-goldfish-model | 403d8881d62022490637d740657b33f01e321ea8 | Apache-2.0 | tanpa PR otomatis, ringkasan perubahan eksplisit |
| miqdadbadjuber/anti-slop | 941b1532f9cc8ffde766bca5921d75257c9e5762 | MIT | (UI/copy; tetap skill on-demand, tidak always-on) |
| fahmi0812/Swanwright | da868bdb4a5423bfd017d19aa5f2ad4a3d5d089b | MIT | hard constraints, evidence FACT, doc-code drift (arXiv:2610.30571) |

Keputusan auto-mode: Karpathy dan superpowers menyarankan "tanya bila ragu", sedangkan poteto menyarankan "never block on the human". Lumitome memilih: ambiguitas kecil → `ASUMSI:` lalu lanjut; tanya hanya untuk risiko merusak atau yang tidak bisa di-undo (grokbot-field-notes "when to stop and ask"). Analisis lengkap: laporan riset LUMITOME-RULES-SYNTHESIS.
