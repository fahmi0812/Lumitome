// prompt.mjs — pembangun prompt delegasi /subagent (v0.3.63).
// Isi ini dulu hidup di `.opencode/commands/subagent.md` (v0.3.61/62) —
// file .md itu DIPENSIUNKAN sebagai pemicu (v0.3.63): .md hanyalah template
// prompt ke model, bukan popup; popup kini dibuka plugin TUI (tui.tsx).
// Prompt ini dikirim plugin ke sesi lewat session.prompt SESUDAH dialog
// ditutup + preset tersimpan. JANGAN pernah menyuruh model memanggil tool
// `question` di sini — popup sudah terjadi di TUI, model hanya mendelegasikan.
import { ROLE_LABELS, ROLE_TIERS, activeRoles } from "./flow.mjs";

/**
 * Prompt delegasi mandiri (subagent tidak melihat riwayat percakapan).
 * @param {object} preset preset tersimpan (hasil dialog)
 * @param {string} task tugas user sesudah `/subagent` (boleh kosong)
 * @param {boolean} liveModel apakah daftar model dibaca live dari 9router
 */
export function buildDelegationPrompt(preset, task, liveModel) {
  const active = activeRoles(preset);
  const roles = active
    .map((r) => `- ${ROLE_LABELS[r]} (agent: ${r}) — model ${preset.roles[r].model} (tier ${ROLE_TIERS[r]})`)
    .join("\n");
  const order = active.join(" → ");
  const taskLine = task ? `Tugas: ${task}` : "Tugas: (tidak ada teks tambahan dari user — kerjakan tugas yang sedang dibahas di sesi ini)";
  const modelNote = liveModel
    ? "Model di atas dibaca live dari 9router."
    : "Daftar model 9router tidak bisa dibaca live — semua peran memakai model terpin 9router/ag/gemini-3.8-flash-high.";
  return [
    "[Konfigurasi /subagent — dipilih user lewat popup TUI, preset sudah tersimpan.]",
    "",
    taskLine,
    `Peran aktif (${preset.mode}):`,
    roles,
    `Urutan delegasi: ${order}`,
    `Mode: ${preset.mode} (paralel maks 3 peran).`,
    modelNote,
    "JUJUR soal batasnya: konfigurasi agent dimuat saat TUI dimulai — pilihan MODEL berlaku mulai sesi TUI berikutnya (restart); pilihan PERAN + MODE berlaku langsung di sesi ini, dengan delegasi memakai model yang terpin di file agent.",
    "",
    "Delegasi via tool subagent (satu-satunya jalur; prompt harus mandiri — subagent tidak melihat riwayat percakapan):",
    "- fast-path: tugas kecil 1-file berisiko rendah → langsung builder.",
    "- serial: thinking → (search) → builder → reviewer.",
    "- paralel (maks 3): search ∥ builder-tiket-siap ∥ reviewer-Standards.",
    "- Tiap delegasi sertakan: tugas + file/path terkait + acceptance + format laporan HASIL/BLOCKED/RISIKO (thinking tambah bagian TANYA).",
    "- Review dua sumbu: panggil reviewer 2× paralel — (a) Standards (lint/aturan repo), (b) Spec (kesetiaan terhadap acceptance). Temuan critical → kembali ke builder (maks 3 iterasi gagal → anti-spin), lalu review ulang.",
    "",
    "Protokol BLOCKED (satu pintu tanya): worker yang mentok MELAPOR ke orchestrator (`BLOCKED: butuh X, sudah mencoba Y, bukti Z`) — TIDAK BOLEH bertanya langsung ke user. Orchestrator men-triase berurutan: (1) jawab HANYA bila jawabannya sudah ada sebagai FACT di konteks → delegasi ulang dengan info lebih lengkap (bila tidak ada FACT-nya, JANGAN menebak — lanjut ke langkah 2); (2) minta thinking memperjelas spec (re-planning); (3) SATU pertanyaan gabungan ke user (bila ada beberapa blocker, gabung); (4) 3 iterasi gagal → berhenti, laporkan premis yang diserang, tanya Fahmi. Thinking yang butuh klarifikasi menulis di bagian TANYA laporannya — orchestrator yang menanyakan ke user, bukan thinking sendiri.",
    "",
    "Peran TIDAK BOLEH mendelegasikan lagi (depth 1; permission task/subagent deny di file agent peran).",
    "Selesai: synthesizer gabung hasil → Verifier + Done-Gate → DONE (klaim DONE tanpa FACT ditolak).",
  ].join("\n");
}
