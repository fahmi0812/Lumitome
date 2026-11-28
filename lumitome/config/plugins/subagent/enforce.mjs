// enforce.mjs — penegakan delegasi /subagent di kode plugin (v0.3.70).
//
// Mekanisme Claude Code dari riset deep-dive 15 Nov 2026 (report.md §4–§5):
// keandalan delegasi BUKAN dari router deterministik, melainkan dari dua hal:
//   (a) harness MENCEGAH kerja langsung (tool allowlist / deny — deterministik);
//   (c) routing SELALU di konteks (deskripsi pendek tiap peran dimuat tiap
//       giliran; isi lengkap baru dimuat saat peran jalan).
// Modul ini logika murninya (tanpa I/O, kecuali tulis metrik fail-silent) —
// dipakai bagian server plugin (index.ts) + tes Node. JANGAN impor node:fs
// di file lain untuk logika ini; path/metrik ada di sini.
//
// Lapisan penegakan (peringkat riset):
//   1. Hapus direct tools dari snapshot orchestrator tiap model call
//      (context hook) + deny edit/shell di permissions file agent
//      (syncOrchestratorPermissions di scripts/apply-subagent-preset.mjs).
//      Tanpa edit/write/shell, kerja langsung MUSTAHIL — hanya delegasi.
//   2. Injeksi protokol delegasi PENDEK tiap model call (context hook) +
//      deskripsi peran trigger-first + saling eksklusif (file agent).
//   3. Guard execute.before: tolak tool mutasi + validasi panggilan subagent.
//      Throw-to-block HARUS dibuktikan spike-test live (docs resmi hanya
//      menyebut "inspect or replace input") — lihat CHANGELOG v0.3.70.
//   4. Deskripsi tool subagent bawaan dipertajam (prepend pemicu) — JANGAN
//      bikin wrapper tool delegate (riset melarang: alat kedua = pilihan
//      routing kedua, lebih lemah dari tool bawaan).
//   5. Pengukuran delegation-rate (JSONL) + audit akhir giliran (event
//      session.execution.*). Re-drive TIDAK dibangun: engine 2.3.0 tidak
//      punya hook Stop/SubagentStop pemblokir; re-prompt via event
//      berpacu dengan input user dan bisa loop — audit hanya mencatat.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ORCHESTRATOR_AGENT = "orchestrator";
export const ROLES = ["thinking", "search", "builder", "reviewer"];
export const ROLE_LABELS = {
  thinking: "Thinking",
  search: "Search",
  builder: "Build",
  reviewer: "Review",
};

/**
 * Tool yang BOLEH ada di snapshot orchestrator saat mode /subagent ON.
 * subagent = satu-satunya jalur kerja; question = satu pintu tanya ke user
 * (protokol BLOCKED langkah 3 — orchestrator boleh bertanya SATU pertanyaan
 * gabungan); read/glob/grep = baca saja, tidak mengubah keadaan.
 * Semua yang lain dihapus dari snapshot tiap model call (context hook).
 */
export const ORCHESTRATOR_ALLOWED_TOOLS = ["subagent", "question", "read", "glob", "grep"];

/** Tool yang MENGUBAH keadaan — guard execute.before menolaknya dari orchestrator. */
export const MUTATING_TOOLS = ["edit", "write", "patch", "shell", "execute"];

/** Tool lain yang bukan jalur delegasi (dihapus dari snapshot + ditolak guard bila dipanggil). */
export const NON_DELEGATION_TOOLS = ["skill", "webfetch", "websearch"];

/** Preset aktif? Field hilang = aktif (kompatibel ke belakang, v0.3.62). */
export function isEnabled(preset) {
  return preset?.enabled !== false;
}

/** Penegakan berlaku? Hanya sesi orchestrator saat sistem ON. Sesi lain (peran, sektor) tidak disentuh. */
export function shouldEnforce(preset, agent) {
  return isEnabled(preset) && agent === ORCHESTRATOR_AGENT;
}

/**
 * Hapus tool di luar allowlist dari snapshot (mutasi in-place, seperti event.tools
 * di context hook). Kembali {changed, removed} — removed = nama tool yang dibuang.
 * Bila tidak menegakkan (OFF / agent lain / tools bukan objek) → tidak berubah.
 */
export function applyToolEnforcement(tools, preset, agent) {
  if (!tools || typeof tools !== "object") return { changed: false, removed: [] };
  if (!shouldEnforce(preset, agent)) return { changed: false, removed: [] };
  const removed = [];
  for (const name of Object.keys(tools)) {
    if (!ORCHESTRATOR_ALLOWED_TOOLS.includes(name)) {
      delete tools[name];
      removed.push(name);
    }
  }
  return { changed: removed.length > 0, removed };
}

/**
 * Protokol delegasi PENDEK untuk injeksi tiap model call (context hook).
 * Bukan prompt raksasa: hanya tabel rute (kata kerja → peran), format
 * panggilan, urutan, dan aturan BLOCKED satu pintu tanya. Sengaja pendek
 * (~150 kata) — perhatian model menurun seiring panjang instruksi (riset:
 * deskripsi selalu-di-konteks harus pendek; aturan panjang di file rules
 * tetap ada sebagai referensi, bukan sebagai pengambil keputusan rute).
 */
export function buildDelegationProtocol(preset) {
  const mode = preset?.mode === "paralel" ? "paralel" : "serial";
  return [
    `[Mode subagent ON — ${mode}] Kamu Orchestrator: kerjakan tugas HANYA lewat tool subagent. Kamu tidak punya tool edit/write/shell — jangan coba menulis, mengedit, atau menjalankan perintah sendiri.`,
    "Pilih peran dari KATA KERJA tugas: rencanakan/spec/tiket → thinking; cari/baca konteks → search; implementasi/tulis kode/perbaiki → builder; periksa/verifikasi/review hasil → reviewer.",
    "Panggil subagent dengan agent + description diawali label peran, mis. description \"[Builder] Implementasi pencarian di index.html\", prompt berisi tugas + file + acceptance + format laporan HASIL/BLOCKED/RISIKO.",
    `Urutan: thinking → search → builder → reviewer${mode === "paralel" ? " (paralel maks 3, hanya yang disebut)" : ""}. Tugas kecil 1-file boleh langsung builder. Worker yang mentok MELAPOR BLOCKED ke kamu — jangan biarkan mereka bertanya ke user; bila perlu, tanya user SATU pertanyaan gabungan.`,
  ].join("\n");
}

/**
 * Deskripsi tool subagent bawaan yang dipertajam: PREPEND blok pemicu ke
 * deskripsi asli engine (current) — mekanika asli (background, sessionID,
 * jangan polling) tetap utuh. Tanpa current (tes) → fallback satu baris.
 */
export function subagentToolDescription(preset, current) {
  const trigger =
    "DELEGASI WAJIB di mode subagent: semua kerja lewat tool ini — kamu tidak punya edit/write/shell. " +
    "Pilih peran dari kata kerja: rencanakan/spec → thinking; cari/baca konteks → search; " +
    "implementasi/tulis kode → builder; periksa/verifikasi → reviewer. " +
    "Awali description dengan label peran, mis. \"[Builder] …\".\n\n";
  const base =
    typeof current === "string" && current.length > 0
      ? current
      : "Spawns an agent in a child session to work on the specified task.";
  return trigger + base;
}

/**
 * Validasi panggilan subagent: agent harus peran dikenal, prompt +
 * description tidak kosong. Kembali string error atau null bila valid.
 * (Label "[Peran]" di description TIDAK dipaksa di sini — tanpanya toast
 * peran hanya kehilangan label, bukan gagal; pemaksaan keras berisiko
 * loop retry pada model yang tidak memakai label.)
 */
export function validateSubagentCall(input) {
  const agent = input?.agent;
  if (typeof agent !== "string" || !ROLES.includes(agent)) {
    return `subagent: agent '${agent}' bukan peran /subagent (yang ada: ${ROLES.join(", ")}) — pilih salah satu peran itu`;
  }
  if (typeof input?.prompt !== "string" || input.prompt.trim().length === 0) {
    return `subagent: prompt kosong — sertakan tugas + file + acceptance + format laporan HASIL/BLOCKED/RISIKO`;
  }
  if (typeof input?.description !== "string" || input.description.trim().length === 0) {
    return `subagent: description kosong — awali dengan label peran, mis. "[${ROLE_LABELS[agent]}] …"`;
  }
  return null;
}

/**
 * Guard panggilan tool dari orchestrator (dipakai execute.before).
 * Kembali string error (alasan penolakan — dibaca model sebagai hasil tool
 * gagal, lalu ia pulih dengan delegasi) atau null bila boleh jalan.
 * Tool yang tidak dikenal (string kosong/bukan string) dibiarkan lewat —
 * guard tidak boleh memblokir yang tidak ia kenali.
 */
export function guardToolCall({ preset, agent, tool, input }) {
  if (!shouldEnforce(preset, agent)) return null;
  if (typeof tool !== "string" || tool.length === 0) return null;
  if (tool === "subagent") {
    const bad = validateSubagentCall(input);
    return bad === null ? null : `[subagent-guard] ${bad}`;
  }
  if (ORCHESTRATOR_ALLOWED_TOOLS.includes(tool)) return null;
  if (MUTATING_TOOLS.includes(tool)) {
    return `[subagent-guard] ${tool} dimatikan untuk Orchestrator di mode subagent — kerjakan lewat subagent (thinking/search/builder/reviewer), bukan langsung.`;
  }
  return `[subagent-guard] tool ${tool} tidak tersedia untuk Orchestrator di mode subagent — gunakan subagent (peran) untuk kerja itu, atau question bila harus bertanya ke user.`;
}

/** Klasifikasi tool untuk metrik: subagent | mutating | other. */
export function classifyTool(tool) {
  if (tool === "subagent") return "subagent";
  if (MUTATING_TOOLS.includes(tool)) return "mutating";
  return "other";
}

/** Home Lumitome (sama seperti loadLiveModels): $LUMI_HOME atau ~/.lumitome. */
export function lumiHome() {
  return process.env.LUMI_HOME || path.join(os.homedir(), ".lumitome");
}

/** Path file metrik JSONL (satu baris per kejadian). */
export function metricsPath(home = lumiHome()) {
  return path.join(home, "subagent-metrics.jsonl");
}

/**
 * Tulis satu baris JSONL metrik (fail-silent — metrik tidak boleh
 * mematikan plugin; tulis gagal → false, tanpa lempar).
 */
export function appendMetrics(home, entry) {
  try {
    fs.appendFileSync(metricsPath(home), JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** Debug bentuk event hook (LUMI_SUBAGENT_DEBUG=1) — untuk spike-test, default mati. */
export function debugEnabled() {
  return process.env.LUMI_SUBAGENT_DEBUG === "1";
}

/** Counter per sesi: { subagent, mutating, other, blocked, audited: {...} }. */
export function newCounters() {
  return { subagent: 0, mutating: 0, other: 0, blocked: 0, audited: { subagent: 0, mutating: 0, other: 0, blocked: 0 } };
}

/** Hitung satu panggilan tool ke counter (blocked = ditolak guard). */
export function countTool(counters, tool, blocked = false) {
  const kind = classifyTool(tool);
  counters[kind] += 1;
  if (blocked) counters.blocked += 1;
  return counters;
}

/**
 * Delta sejak audit terakhir (satu giliran): kembalikan delta + majukan
 * penanda audited. Audit akhir giliran memakai ini — giliran tanpa
 * delegasi (delta.subagent === 0) tercatat sebagai temuan audit.
 */
export function turnDelta(counters) {
  const delta = {
    subagent: counters.subagent - counters.audited.subagent,
    mutating: counters.mutating - counters.audited.mutating,
    other: counters.other - counters.audited.other,
    blocked: counters.blocked - counters.audited.blocked,
  };
  counters.audited = {
    subagent: counters.subagent,
    mutating: counters.mutating,
    other: counters.other,
    blocked: counters.blocked,
  };
  return delta;
}

/**
 * Evaluasi pelanggaran delegasi untuk Pre-Stop Re-drive Gate (M1 / T2.1).
 * Mengintip delta tool call sejak audit terakhir tanpa memajukan penanda audited.
 */
export function evaluateDelegationViolation(counters, preset, agent, { turnHasCodeClaim = false } = {}) {
  if (!shouldEnforce(preset, agent)) {
    return { violation: false, reason: null, delta: null };
  }
  const c = counters || newCounters();
  const delta = c.audited
    ? {
        subagent: (c.subagent || 0) - (c.audited.subagent || 0),
        mutating: (c.mutating || 0) - (c.audited.mutating || 0),
        other: (c.other || 0) - (c.audited.other || 0),
        blocked: (c.blocked || 0) - (c.audited.blocked || 0),
      }
    : {
        subagent: c.subagent || 0,
        mutating: c.mutating || 0,
        other: c.other || 0,
        blocked: c.blocked || 0,
      };
  const violated = (delta.mutating > 0 || delta.blocked > 0 || Boolean(turnHasCodeClaim)) && delta.subagent === 0;
  return {
    violation: violated,
    reason: violated ? "DELEGATION_BYPASS" : null,
    delta,
  };
}
