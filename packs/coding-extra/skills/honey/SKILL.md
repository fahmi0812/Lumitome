---
name: honey
description: Dense handoff prose for agent-to-agent messages. Cuts filler without touching anti-spin or model routing.
metadata:
  swanwright_original_id: swanwright__honey
---

# Honey

Source: https://github.com/Green-PT/honey-for-devs
Pin: cc82b7e7250a8295b4ba556e0aa291d78a9ed38a
License: MIT. Local density/handoff summary. Not a vendored hook stack.

## Tujuan

Mengurangi volume yang tidak membawa fakta: lebih sedikit kode spekulatif, lebih sedikit prosa, handoff antar-agen yang padat.

## Kapan dipakai

Handoff orchestrator↔sektor, progress file, atau jawaban implementasi yang kebanyakan filler. Jangan pakai untuk mengganti anti-spin atau merubah routing model.

## Langkah

1. Intensitas: `lite` jika penjelasan adalah deliverable; `full` (default) untuk tulis/perbaiki; `ultra` hanya one-liner. Naikkan mode jika keringkasan merusak kebenaran.
2. Kode: tangga minimum — tidak perlu / sudah ada / stdlib / satu baris / blok terkecil. Jangan potong validasi, error yang cegah korupsi, atau auth.
3. Prosa: jawaban dulu, buang wind-up. Identifier, path, perintah, pesan error tetap persis.
4. Handoff ke agen lain: JSON minified, rekam by id stabil, agregasi di kode. Bukan format kawat ke manusia.
5. Anti-spin tetap `max_iterations = 3`. Honey tidak menambah iterasi dan tidak menyentuh 9router.

## Input / output

Input: draf atau payload antar-agen. Output: teks/JSON yang sama faktanya, lebih pendek.

## Batasan

Tidak mengganti done-gate. Tidak mengarang `FACT:`. `subagent_depth=1`.
