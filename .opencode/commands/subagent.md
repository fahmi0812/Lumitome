---
description: /subagent — delegasi peran via popup. Pilih peran (Thinking/Search/Build/Review) + model 9router per peran + mode, lalu orchestrator mendelegasikan ke agent peran.
---
# /subagent — delegasi peran via popup (tahap 1)

Aturan keras:
- Popup HANYA muncul bila user memanggil `/subagent` secara eksplisit. JANGAN pernah memunculkannya sendiri di tengah tugas auto.
- Model yang ditawarkan HANYA dari daftar 9router lokal yang masih hidup. JANGAN mengarang ID model. JANGAN tawarkan model provider lain (anthropic/openai/dll.) — Lumitome hanya memakai 9router (AGENTS.md; default terpin `9router/ag/gemini-3.8-flash-high`).
- Peran TIDAK BOLEH mendelegasikan lagi (depth 1; permission `task`/`subagent` deny di file agent peran). Worker TIDAK BOLEH bertanya ke user.

Langkah 1 — daftar model live: jalankan `lumitome models` lewat shell (auto-refresh best-effort; output `9router/<id>` per baris). Bila server tidak merespons / daftar kosong, pakai fallback `9router/ag/gemini-3.8-flash-high` dan KATAKAN begitu ke user. Bila daftar hanya berisi satu model, lewati pertanyaan model di Langkah 2 dan pakai model itu.

Langkah 2 — popup via tool `question` (maks 4 pertanyaan per panggilan; bila perlu, 2 ronde: peran dulu, lalu model):
- Q1 peran aktif (multiple bila didukung tool; bila tidak, tanyakan satu peran per panggilan): Thinking, Search, Build, Review. Default: keempatnya aktif. Design/Council hanya bila user menyebutnya.
- Q2..Qn model per peran aktif (satu pertanyaan per peran; opsi = daftar live Langkah 1). Default tier: Thinking/Review = model terkuat di daftar, Build = menengah-kuat, Search = cepat-murah. Bila daftar hanya satu model, semua peran memakai model itu.
- Q mode: serial | paralel (paralel maks 3).
- Headless (`lumitome run`, tanpa TUI): tool `question` tidak tersedia — LEWATI popup, pakai default (4 peran aktif, model terpin, serial) dan katakan begitu. Jangan berpura-pura popup muncul.

Langkah 3 — simpan pilihan: tulis `.opencode/lumitome-subagent.json` (preset mesin: peran aktif + model + mode), lalu jalankan `lumitome subagent-preset` lewat shell agar baris `model:` file agent peran mengikuti preset (path repo diselesaikan perintah itu sendiri — JANGAN pakai path relatif `scripts/...` karena workspace user bukan repo Lumitome). JUJUR soal batasnya: konfigurasi agent dimuat saat TUI dimulai — pilihan MODEL berlaku mulai sesi TUI berikutnya (restart); pilihan PERAN + MODE berlaku langsung di sesi ini, dengan delegasi memakai model yang terpin di file agent. Jangan klaim model baru langsung aktif di sesi ini.

Langkah 4 — delegasi via tool `subagent` (satu-satunya jalur; prompt harus mandiri — subagent tidak melihat riwayat percakapan):
- fast-path: tugas kecil 1-file berisiko rendah → langsung builder.
- serial: thinking → (search) → builder → reviewer.
- paralel (maks 3): search ∥ builder-tiket-siap ∥ reviewer-Standards.
- Tiap delegasi sertakan: tugas + file/path terkait + acceptance + format laporan HASIL/BLOCKED/RISIKO (thinking tambah bagian TANYA).
- Review dua sumbu: panggil reviewer 2× paralel — (a) Standards (lint/aturan repo), (b) Spec (kesetiaan terhadap acceptance). Temuan critical → kembali ke builder (maks 3 iterasi gagal → anti-spin), lalu review ulang.

Langkah 5 — protokol BLOCKED (satu pintu tanya): worker yang mentok MELAPOR ke orchestrator (`BLOCKED: butuh X, sudah mencoba Y, bukti Z`) — TIDAK BOLEH memanggil tool `question` / bertanya langsung ke user. Orchestrator men-triase berurutan: (1) jawab HANYA bila jawabannya sudah ada sebagai FACT di konteks → delegasi ulang dengan info lebih lengkap (bila tidak ada FACT-nya, JANGAN menebak — lanjut ke langkah 2); (2) minta thinking memperjelas spec (re-planning); (3) SATU pertanyaan gabungan ke user (bila ada beberapa blocker, gabung); (4) 3 iterasi gagal → berhenti, laporkan premis yang diserang, tanya Fahmi. Thinking yang butuh klarifikasi menulis di bagian TANYA laporannya — orchestrator yang menanyakan ke user, bukan thinking sendiri.

Langkah 6 — selesai: synthesizer gabung hasil → Verifier + Done-Gate → DONE (aturan orchestrator 5 berlaku; klaim DONE tanpa FACT ditolak).
