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

const REVIEW_PERSUASIVE_RE = /^(?:\s*(?:JUDGMENT:|Builder\s*(?:note|claim|summary|explanation|justification)\s*:|Catatan\s*Builder\s*:|Alasan\s*Builder\s*:|Riwayat\s*(?:percakapan|chat)\s*:|Chat\s*history\s*:|Conversation\s*:|Self-check\s*:|Confidence\s*:|I(?:'m| am)\s+(?:100%|very|completely|totally)?\s*(?:confident|sure|certain)|Trust me|Saya\s+yakin|Dijamin\s+(?:aman|lolos|benar)|Percayalah|Everything\s+(?:works|is)\s+perfectly).*)$/gim;

/**
 * Sanitasi ringan rahasia untuk prompt/observasi di modul pure-JS (tanpa I/O).
 */
export function scrubPromptSecrets(text) {
  let out = String(text ?? "");
  if (!out) return out;
  out = out.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[REDACTED:PRIVATE_KEY]");
  out = out.replace(/\b(Bearer|Basic)\s+(?!\[REDACTED)(?:[A-Za-z0-9._~+/=-]{8,})/gi, (_, scheme) => `${scheme} [REDACTED:TOKEN]`);
  out = out.replace(/\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{12,}\b/g, "[REDACTED:API_KEY]");
  out = out.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, "[REDACTED:GITHUB_TOKEN]");
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, "[REDACTED:GITHUB_TOKEN]");
  return out.replace(
    /(\b(?:NINEROUTER_API_KEY|LUMI_KEY_[A-Z0-9_]+|LUMI_9ROUTER_KEY|[A-Z][A-Z0-9_]*(?:_API_KEY|_SECRET_KEY|_ACCESS_TOKEN|_AUTH_TOKEN|_PRIVATE_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSWD|_KEY))\s*[:=]\s*)(["']?)(?!\[REDACTED)([^\s"'\n\r;]{4,})\2/g,
    "$1$2[REDACTED:ENV]$2",
  );
}

/**
 * Sanitasi deterministik prompt reviewer (M4 / T2.4): buang <think>, narasi persuasif builder,
 * self-praise, riwayat chat, rahasia, dan klaim ATTESTED(...) mentah tanpa runtime witness.
 */
export function stripReviewerNoise(text) {
  let out = scrubPromptSecrets(String(text ?? "").replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim());
  out = out.replace(/^(?:#{1,3}\s*)?(?:Builder\s+Narrative|Narasi\s+Builder|Conversation\s+History|Riwayat\s+Percakapan|Chain\s+of\s+Thought)\b[\s\S]*?(?=\n#{1,3}\s|\s*$)/gim, "");
  out = out.replace(REVIEW_PERSUASIVE_RE, "");
  out = out.replace(/\bATTESTED\([^)\n]*\)/g, "[STRIPPED_UNVERIFIED_ATTESTED]");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildReviewerContextPrompt(input, reviewerCtxMod = null, contextBudgetMod = null) {
  const scrub = contextBudgetMod?.scrubSecrets ?? scrubPromptSecrets;
  if (typeof input === "string") {
    const base = reviewerCtxMod?.sanitizeReviewerPrompt
      ? reviewerCtxMod.sanitizeReviewerPrompt(input)
      : (stripReviewerNoise(input) || input.trim());
    return scrub(base);
  }
  if (reviewerCtxMod?.buildStrippedReviewPacket && reviewerCtxMod?.formatStrippedReviewPacket) {
    const pkt = reviewerCtxMod.buildStrippedReviewPacket(input || {});
    return scrub(reviewerCtxMod.formatStrippedReviewPacket(pkt));
  }
  const spec = stripReviewerNoise(input?.spec ?? "");
  const diff = scrub(String(input?.diff ?? ""));
  const files = Array.isArray(input?.targetFiles) ? input.targetFiles : [];
  const facts = (Array.isArray(input?.facts) ? input.facts : [])
    .filter((f) => /^FACT:/i.test(String(f).trim()) && !/\bATTESTED\s*\(/.test(String(f)))
    .map((f) => scrub(f));
  return [
    "[CONTEXT-STRIPPED REVIEW PACKET]",
    "## SPEC",
    spec || "(kosong)",
    "## TARGET FILES",
    files.length ? files.map((f) => `- ${f}`).join("\n") : "(tidak ditentukan)",
    "## FACTS (ATTESTED / VERIFIED)",
    facts.length ? facts.map((f) => `- ${f}`).join("\n") : "(belum ada witness VALID / FACT)",
    "## DIFF",
    "```diff",
    diff || "(diff kosong)",
    "```",
  ].join("\n");
}

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
