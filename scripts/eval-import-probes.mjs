#!/usr/bin/env node
/**
 * Ukur retrieval pada probe impor (tests/golden-import-probes.json) — terpisah
 * dari golden 154 agar baseline tidak berubah. Logika sama dengan
 * scripts/skill-metrics.mjs: retrieval deterministik tanpa Layer-1.
 * Pakai: node scripts/eval-import-probes.mjs [--json]
 */
import fs from "node:fs";
import { openDb, searchSkills, buildQueries, buildIndex, indexState, PICK_MAX } from "../router/skill-db.mjs";
import { layer0 } from "../router/layer0-regex.mjs";

if (!indexState().fresh) await buildIndex({ quiet: true });
const g = JSON.parse(fs.readFileSync("tests/golden-import-probes.json", "utf8"));
const db = openDb("runtime/skills.db", { readOnly: true });

let l0mis = 0, top1 = 0, sel5 = 0, mrrSum = 0;
const misses = [];
for (const c of g) {
  const l0 = layer0(c.prompt);
  if (l0.hit && l0.sektor && l0.sektor !== c.expect_sektor) l0mis++;
  const r = await searchSkills(db, buildQueries(c.prompt, l0), { sectors: l0.sektor ? [l0.sektor] : [], n: 32, hints: l0.skillsHint || [] });
  const names = r.candidates.map((x) => x.name);
  const picked = names.slice(0, PICK_MAX);
  if (names[0] === c.expect_skill) top1++;
  if (picked.includes(c.expect_skill)) sel5++;
  else misses.push({ id: c.id, gold: c.expect_skill, top: picked.slice(0, 3), l0: l0.sektor || null });
  const rk = names.findIndex((x) => x === c.expect_skill);
  if (rk >= 0) mrrSum += 1 / (rk + 1);
}
const f = (x) => Number((x / g.length).toFixed(4));
const out = { probes: g.length, layer0_mismatch: l0mis, top1_accuracy: f(top1), recall_at5: f(sel5), mrr_at32: f(mrrSum), misses_at5: misses.length, miss_examples: misses };
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`probes=${out.probes} L0-mismatch=${out.layer0_mismatch}`);
  console.log(`top-1=${out.top1_accuracy} recall@5=${out.recall_at5} MRR=${out.mrr_at32} misses@5=${out.misses_at5}`);
  for (const m of misses) console.log(`  MISS ${m.id} gold=${m.gold} l0=${m.l0} top=[${m.top.join(", ")}]`);
}
