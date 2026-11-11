---
description: /refresh-models — refresh daftar model provider, lalu minta restart TUI agar daftar baru terbaca.
---
Jalankan `lumitome models --refresh` lewat shell, lalu laporkan model baru yang muncul (atau bahwa daftar tidak berubah / provider tidak merespons — cache lama dipakai).

Jujur soal batasnya: sesi TUI yang sedang berjalan TIDAK mendapat model baru sampai restart — daftar model engine dimuat saat TUI dimulai. Minta pengguna menutup TUI ini (`/exit` atau Ctrl-C) lalu membuka `lumitome` lagi, dan jangan berpura-pura daftar di sesi ini sudah berubah.
