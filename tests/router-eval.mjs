#!/usr/bin/env node
/** Eval routing skill lintas domain. Pakai: node tests/router-eval.mjs [--l1] [--json]
 *  hit@5 = ≥1 skill harapan ada di pilihan; top1 = pilihan #1 ada di harapan.
 *  expect [] = katalog aktif tidak punya skill domain itu → benar bila pilihan kosong. */
import { route, indexState, buildIndex } from "../router/skill-db.mjs";
export const CASES = [
  ["buat REST API express dengan endpoint CRUD dan test", ["tdd-red-green-refactor", "typed-service-contracts", "mongodb-ops", "supabase-ops"]],
  ["desain skema MongoDB dan index untuk aplikasi toko", ["mongodb-ops"]],
  ["debug error 500 di backend node, cari akar masalah", ["systematic-debugging", "root-cause-gate"]],
  ["analisis laporan keuangan dan rasio likuiditas perusahaan", ["analisis-laporan-keuangan"]],
  ["bantu bikin anggaran bulanan dan dana darurat keluarga", ["keuangan-pribadi"]],
  ["cara lapor SPT tahunan karyawan dan NPWP", ["pajak-dasar-id"]],
  ["pembukuan kas warung UMKM sampai laporan laba rugi", ["akuntansi-umkm"]],
  ["backtest strategi trading saham dengan python", []],
  ["edit video tiktok dengan subtitle dan musik", ["video-demo", "motion-design", "sound-design"]],
  ["tulis artikel SEO bahasa indonesia yang natural", ["naskah-id", "humanizer-indonesia"]],
  ["riset literatur paper tentang LLM agent", ["research", "deep-research"]],
  ["audit keamanan kode aplikasi web", ["security-audit", "code-audit", "full-audit-keamanan"]],
  ["buat landing page react dengan animasi scroll", ["react", "next", "gsap-scrolltrigger", "gsap-core", "design-taste-frontend", "magic-ui"]],
  ["review PR saya sebelum merge", ["code-review", "requesting-code-review", "receiving-code-review"]],
  ["buat slide presentasi pitch deck", ["slides"]],
  ["deploy aplikasi next ke vercel", ["vercel-ops", "next"]],
  ["tulis dokumentasi API untuk SDK", ["technical-writer"]],
];
if (import.meta.url === `file://${process.argv[1]}`) {
  const l1 = process.argv.includes("--l1");
  if (!indexState().fresh) await buildIndex({ quiet: true });
  let hit = 0, top1 = 0, prec = 0; const rows = [];
  for (const [q, exp] of CASES) {
    const r = await route(q, { useL1: l1, log: false });
    const p = r.picked;
    const h = exp.length ? p.some((s) => exp.includes(s)) : p.length === 0;
    const t = exp.length ? exp.includes(p[0]) : p.length === 0;
    const pr = exp.length ? (p.length ? p.filter((x) => exp.includes(x)).length / p.length : 0) : (p.length ? 0 : 1); prec += pr;
    hit += h; top1 += t; rows.push({ q, l0: r.l0.sektor, l1: r.l1.status, ms: r.l1.ms ?? null, picked: p, hit: h, top1: t });
  }
  const out = { mode: l1 ? "L0+retrieval+L1" : "L0+retrieval (fallback)", n: CASES.length, hit5: hit, top1, precision: +(prec / CASES.length).toFixed(3), rows };
  if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else { for (const r of rows) console.log(`${r.hit ? "HIT " : "MISS"} ${r.top1 ? "T1" : "  "} [${r.l0 || "-"}|L1=${r.l1}${r.ms ? " " + r.ms + "ms" : ""}] ${r.q} → ${r.picked.join(", ") || "(kosong)"}`);
    console.log(`${out.mode}: hit@5=${hit}/${CASES.length} top1=${top1}/${CASES.length} precision=${out.precision}`); }
}
