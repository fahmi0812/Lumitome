/**
 * Budget token (len/4) per seksi router/skills-index.md — TRIAL lepas-dorman.
 *
 * Satu sumber kebenaran untuk cap indeks; dipakai tests/suite-routing.mjs (asersi
 * keras) dan scripts/validate.mjs (peringatan). Jangan hardcode angka cap
 * di tempat lain (pelajaran v0.3.20: hitungan hardcode pecah tiap ada
 * skill baru).
 *
 * Angka diukur sesudah impor 341 (registry 900 skill; indeks 734 entri,
 * 17715 tok): coding 6580, security 145, riset 104,
 * penulisan 4148, media 4033, finance 97, misc 2559. Cap = terukur x1,25,
 * dibulatkan ke atas ke kelipatan 100 (minimum 200 untuk seksi kecil).
 * Total = jumlah cap seksi (22400). Bila seksi tumbuh melewati cap,
 * naikkan cap DI SINI secara sadar — jangan ubah asersi di suite/validate.
 * Desain: satu file indeks, asersi per seksi (bukan satu file per sektor) —
 * diff terkecil: generator, --check, dan konsumen sudah berbentuk satu file.
 */
export const INDEX_SECTION_BUDGETS = { coding: 8300, security: 200, riset: 200, penulisan: 5200, media: 5100, finance: 200, misc: 3200 };
export const INDEX_DEFAULT_SECTION_BUDGET = 1000;
export const INDEX_TOTAL_BUDGET = 22400;

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
