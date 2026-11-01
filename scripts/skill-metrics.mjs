#!/usr/bin/env node
/**
 * Metrik routing skill pada golden set (tests/golden-routing.json, 154 kasus).
 * Gold = expect_skill bila ada, else skill aktif berawalan skills_hint. Kasus tanpa gold → hanya cek sektor.
 * Mode: retrieval deterministik (tanpa L1) — angka = batas bawah sebelum Layer-1.
 * Pakai: node scripts/skill-metrics.mjs [--json] [--out runtime/metrics.json]
 */
import fs from "node:fs";
import { openDb, searchSkills, buildQueries, buildIndex, indexState, hintMatch, embedProvider, PICK_MAX } from "../router/skill-db.mjs";
import { layer0 } from "../router/layer0-regex.mjs";

if (!indexState().fresh) await buildIndex({ quiet: true });
const g = JSON.parse(fs.readFileSync("tests/golden-routing.json", "utf8"));
const db = openDb("runtime/skills.db", { readOnly: true });
const active = db.prepare("SELECT name FROM skill WHERE status='active'").all().map((r) => r.name);
const meta = Object.fromEntries(db.prepare("SELECT k,v FROM meta").all().map((r) => [r.k, r.v]));
const goldOf = (c) => c.expect_skill ? [c.expect_skill] : [...new Set((c.skills_hint || []).flatMap((h) => active.filter((n) => hintMatch(n, h))))];

let l0hit = 0, l0mis = 0, withGold = 0, top1 = 0, sel5 = 0, sel5Frac = 0, cand16 = 0, cand32 = 0, zeroLoad = 0, mrrSum = 0;
const lat = [], misses = [];
for (const c of g) {
  const l0 = layer0(c.prompt);
  if (l0.hit && l0.sektor && l0.sektor !== c.expect_sektor) l0mis++; // definisi = tests/suite.mjs (strict gate)
  if (l0.hit) l0hit++;
  const gold = goldOf(c);
  if (!gold.length) continue;
  withGold++;
  const r = await searchSkills(db, buildQueries(c.prompt, l0), { sectors: l0.sektor ? [l0.sektor] : [], n: 32, hints: l0.skillsHint || [] });
  lat.push(r.retr_ms);
  const names = r.candidates.map((x) => x.name);
  const picked = names.slice(0, PICK_MAX);
  if (!picked.length) zeroLoad++;
  if (gold.includes(names[0])) top1++;
  const hit5 = gold.filter((x) => picked.includes(x)).length;
  if (hit5) sel5++; else misses.push({ id: c.id, gold: gold.slice(0, 3), top: picked.slice(0, 3) });
  sel5Frac += hit5 / gold.length;
  if (gold.some((x) => names.slice(0, 16).includes(x))) cand16++;
  if (gold.some((x) => names.includes(x))) cand32++;
  const rk = names.findIndex((x) => gold.includes(x)); if (rk >= 0) mrrSum += 1 / (rk + 1);
}
lat.sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] ?? 0;
const f = (x) => Number((x / (withGold || 1)).toFixed(4));
const out = {
  golden_total: g.length, layer0_mismatch: l0mis, layer0_hit: l0hit, cases_with_gold: withGold, embed: meta.embed, dim: Number(meta.dim), vec: meta.vec || null,
  top1_accuracy: f(top1), selected_recall_at5_any: f(sel5), selected_recall_at5_frac: f(sel5Frac),
  candidate_recall_at16: f(cand16), candidate_recall_at32: f(cand32), mrr_at32: f(mrrSum), zero_load_rate: f(zeroLoad),
  retrieval_ms_p50: pct(0.5), retrieval_ms_p95: pct(0.95), misses_at5: misses.length, miss_examples: misses.slice(0, 8),
  note: "Tanpa Layer-1 (9router). selected@5 = top-5 retrieval deterministik.",
};
const oi = process.argv.indexOf("--out");
fs.mkdirSync("runtime", { recursive: true });
fs.writeFileSync(oi >= 0 ? process.argv[oi + 1] : "runtime/metrics.json", JSON.stringify(out, null, 2));
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`golden=${out.golden_total} L0-mismatch=${out.layer0_mismatch} gold-cases=${withGold} embed=${out.embed}${out.dim ? "/" + out.dim : ""}`);
  console.log(`top-1=${out.top1_accuracy} recall@5(any)=${out.selected_recall_at5_any} recall@5(frac)=${out.selected_recall_at5_frac} cand-recall@16=${out.candidate_recall_at16} @32=${out.candidate_recall_at32} MRR=${out.mrr_at32} zero-load=${out.zero_load_rate}`);
  console.log(`retrieval p50=${out.retrieval_ms_p50}ms p95=${out.retrieval_ms_p95}ms misses@5=${out.misses_at5}`);
}
process.exit(out.layer0_mismatch === 0 ? 0 : 1);
