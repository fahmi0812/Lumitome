// prompt.mjs — pemberitahuan singkat mode /subagent (v0.3.67).
//
// DULU (v0.3.63–v0.3.66) file ini membangun prompt delegasi RAKSASA
// (peran + model + urutan + mode + protokol BLOCKED + review dua sumbu,
// ~30 baris) yang di-inject ke chat lewat session.prompt — Fahmi menilai
// aneh (15 Nov 16:42 WIB): konfigurasi masuk lewat prompt, bukan native.
//
// SEJAK v0.3.67 aturan lengkap tinggal di FILE AGENT (cara native OpenCode
// mendefinisikan agent):
//   - `.opencode/rules/subagent.md` — urutan delegasi, fast-path,
//     review dua sumbu, protokol BLOCKED satu pintu tanya, depth-1
//     (dibaca orchestrator lewat butir 11 di orchestrator.md; file itu
//     sendiri memagari diri: hanya berlaku bila baris mode menyebut
//     serial/paralel).
//   - `.opencode/agents/orchestrator.md` — butir 11 (gerbang mode) + baris
//     "Mode /subagent saat ini" (ditulis otomatis `lumitome subagent-preset`
//     saat preset disimpan/diubah; baris itu yang mengaktifkan/mematikan
//     aturan peran — bila OFF, orchestrator kerja seperti biasa tanpa peran).
//   - `.opencode/agents/{thinking,search,builder,reviewer}.md` — format
//     laporan peran + larangan tanya langsung ke user (permission deny).
// Ke sesi HANYA dikirim pemberitahuan SINGKAT (maks 2 baris): mode +
// urutan + model Thinking + tugas (bila ada). Tanpa kata "Protokol
// BLOCKED", tanpa format laporan, tanpa penjelasan batasan.
//
// v0.3.68: pemberitahuan ini HANYA dikirim ke sesi yang SUDAH BERJALAN
// sebelum save (tui.tsx: sendSubagentNotice dari jalur "Simpan saja" dan
// dari enterSubagentMode bila sesi sudah ada). Sesi BARU (dibuat lewat
// "Ya, mulai") TIDAK menerima pemberitahuan ini — ia membaca konfigurasi
// dari blok "Konfigurasi aktif" di .opencode/rules/subagent.md (mapping
// peran→model + urutan + mode, ditulis otomatis saat preset disimpan oleh
// scripts/apply-subagent-preset.mjs). Alasannya: pemberitahuan ke sesi baru
// terasa seperti prompt injection (Fahmi 17:20 WIB), padahal sesi baru
// sudah memuat aturan dari file.
//
// Batasan jujur: sesi yang sudah BERJALAN sebelum upgrade tidak memuat
// aturan baru dari orchestrator.md sampai TUI di-restart (file agent
// dimuat saat TUI dimulai). Pemberitahuan singkat hanya membawa delta
// dinamis (mode + urutan + model Thinking + tugas); aturan statisnya
// dibaca sesi BARU dari file. Toast sesudah simpan tetap menyebut
// "Model peran berlaku mulai sesi TUI berikutnya."
import { activeRoles, DEFAULT_MODEL } from "./flow.mjs";

/**
 * Pemberitahuan singkat mode /subagent (maks 2 baris).
 * @param {object} preset preset tersimpan (hasil dialog)
 * @param {string} task tugas user sesudah `/subagent` (boleh kosong)
 */
export function buildSubagentNotice(preset, task) {
  const order = activeRoles(preset).join(" → ");
  const thinking = preset?.roles?.thinking?.model ?? DEFAULT_MODEL;
  const first = `Mode subagent aktif: ${preset?.mode === "paralel" ? "paralel" : "serial"} · ${order} · Thinking: ${thinking}.`;
  const second = task
    ? `Tugas: ${task}`
    : "Aturan lengkap di .opencode/rules/subagent.md — beri tugas untuk mulai.";
  return [first, second].join("\n");
}
