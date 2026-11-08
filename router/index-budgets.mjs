/**
 * Budget token (len/4) per seksi router/skills-index.md — TRIAL lepas-dorman.
 *
 * Satu sumber kebenaran untuk cap indeks; dipakai tests/suite.mjs (asersi
 * keras) dan scripts/validate.mjs (peringatan). Jangan hardcode angka cap
 * di tempat lain (pelajaran v0.3.20: hitungan hardcode pecah tiap ada
 * skill baru).
 *
 * Angka diukur sesudah merge (registry 624 skill; indeks 458 entri,
 * 10817 tok, 476 baris): coding 5353, security 145, riset 104,
 * penulisan 1131, media 1379, finance 97, misc 2559. Cap = terukur x1,25,
 * dibulatkan ke atas ke kelipatan 100 (minimum 200 untuk seksi kecil).
 * Total = jumlah cap seksi (13800). Bila seksi tumbuh melewati cap,
 * naikkan cap DI SINI secara sadar — jangan ubah asersi di suite/validate.
 * Desain: satu file indeks, asersi per seksi (bukan satu file per sektor) —
 * diff terkecil: generator, --check, dan konsumen sudah berbentuk satu file.
 */
export const INDEX_SECTION_BUDGETS = { coding: 6700, security: 200, riset: 200, penulisan: 1500, media: 1800, finance: 200, misc: 3200 };
export const INDEX_DEFAULT_SECTION_BUDGET = 1000;
export const INDEX_TOTAL_BUDGET = 13800;

/** Token per seksi (len/4) + total dari teks router/skills-index.md. */
export function indexSectionTokens(text) {
  const parts = String(text).split(/^## /m).slice(1);
  const out = {};
  for (const p of parts) {
    const name = p.split("\n")[0].trim();
    out[name] = Math.ceil(("## " + p).length / 4);
  }
  out.total = Math.ceil(String(text).length / 4);
  return out;
}
