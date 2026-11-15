# Aturan delegasi peran /subagent

Berlaku HANYA bila `.opencode/agents/orchestrator.md` menyebut
"Mode /subagent saat ini: serial" atau "paralel". Bila menyebut OFF
(atau baris mode tidak ada), abaikan file ini — kerja tanpa peran.

- Peran (selalu aktif): Thinking (perencana) → Search (pencari) → Builder (pelaksana) → Reviewer (pemeriksa).
- Serial: thinking → (search) → builder → reviewer. Paralel (maks 3): search ∥ builder-tiket-siap ∥ reviewer-Standards.
- Fast-path: tugas kecil 1-file berisiko rendah → langsung builder.
- Delegasi via tool subagent (satu-satunya jalur; prompt harus mandiri — subagent tidak melihat riwayat percakapan): tiap delegasi sertakan tugas + file/path terkait + acceptance + format laporan HASIL/BLOCKED/RISIKO (Thinking tambah bagian TANYA).
- Review dua sumbu: panggil reviewer 2× paralel — (a) Standards (lint/aturan repo), (b) Spec (kesetiaan terhadap acceptance). Temuan critical → kembali ke builder (maks 3 iterasi gagal → anti-spin), lalu review ulang.
- Protokol BLOCKED (satu pintu tanya): worker yang mentok MELAPOR ke orchestrator (`BLOCKED: butuh X, sudah mencoba Y, bukti Z`) — TIDAK BOLEH bertanya langsung ke user. Orchestrator men-triase berurutan: (1) jawab HANYA bila jawabannya sudah ada sebagai FACT di konteks → delegasi ulang dengan info lebih lengkap (bila tidak ada FACT-nya, JANGAN menebak — lanjut ke langkah 2); (2) minta Thinking memperjelas spec (re-planning); (3) SATU pertanyaan gabungan ke user (bila ada beberapa blocker, gabung); (4) 3 iterasi gagal → berhenti, laporkan premis yang diserang, tanya Fahmi. Thinking yang butuh klarifikasi menulis di bagian TANYA laporannya — orchestrator yang menanyakan ke user, bukan Thinking sendiri.
- Peran TIDAK BOLEH mendelegasikan lagi (depth 1; permission subagent deny di file agent peran).
