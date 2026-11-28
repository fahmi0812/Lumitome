/**
 * Budget token terkalibrasi per seksi router/skills-index.md — TRIAL lepas-dorman.
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
 * v0.3.60: security terukur 783 (+26 skill keamanan: owasp, BugHunter 20,
 * trailofbits 5) → cap security 200 → 1000 (783 x1,25 ≈ 979 → 1000).
 * Total = jumlah cap seksi (23200). Bila seksi tumbuh melewati cap,
 * naikkan cap DI SINI secara sadar — jangan ubah asersi di suite/validate.
 * Desain: satu file indeks, asersi per seksi (bukan satu file per sektor) —
 * diff terkecil: generator, --check, dan konsumen sudah berbentuk satu file.
 */
import { estimateTokens } from "./token-estimator.mjs";

export const INDEX_SECTION_BUDGETS = { coding: 8300, security: 1000, riset: 200, penulisan: 5200, media: 5100, finance: 200, misc: 3200 };
export const INDEX_DEFAULT_SECTION_BUDGET = 1000;
export const INDEX_TOTAL_BUDGET = 23200;

/** Token per seksi + total dari teks router/skills-index.md (memakai estimator terkalibrasi, kompatibel API). */
export function indexSectionTokens(text, opts = {}) {
  const estimator = opts.legacy ? (t) => Math.ceil(String(t).length / 4) : (t) => estimateTokens(t, opts);
  const parts = String(text).split(/^## /m).slice(1);
  const out = {};
  for (const p of parts) {
    const name = p.split("\n")[0].trim();
    out[name] = estimator("## " + p);
  }
  out.total = estimator(String(text));
  return out;
}
