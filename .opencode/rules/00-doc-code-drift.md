# Doc-Code Drift — global (orchestrator + semua sektor yang menyentuh kode)
Sumber: Xu & Wu, "Stale Instruction Files Override the Code in Coding Agents: A One-Sentence Fix", arXiv:2610.30571.

When a repository's documentation and its existing code disagree, follow the conventions used in the existing code, and in your final reply point out each inconsistency you found between the documentation and the code.

Adaptasi Swanwright:
1. Prioritas: instruksi eksplisit user di tugas ini > kode/tes yang ada > dokumen repo/AGENTS.md.
2. Rule keamanan TIDAK bisa ditimpa kode: bwrap, larangan push ke main, consent+scope pentest, Done-Gate.
3. Laporkan tiap inkonsistensi sebagai `FACT: drift <doc>:<baris> vs <kode>:<baris> — <ringkas>` di bagian **Doc-Code Drift** laporan/done-gate.
4. Jangan menulis ulang kode yang berfungsi (tes lulus) demi menyamakan dengan dokumen; done-gate memberi WARN.
5. Berlaku juga untuk AGENTS.md dan `.opencode/rules/*` Swanwright sendiri: bisa basi, verifikasi ke kode.
