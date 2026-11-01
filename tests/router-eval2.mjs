#!/usr/bin/env node
/** Eval router v2: dev (17 lama + dev_new) & test (held-out). Pakai: node tests/router-eval2.mjs [--l1] [--json] [--split dev|test|all] */
import fs from "node:fs";
import { route, indexState, buildIndex } from "../router/skill-db.mjs";
import { CASES } from "./router-eval.mjs";
const V = JSON.parse(fs.readFileSync(new URL("./router-eval-v2.json", import.meta.url), "utf8"));
const l1 = process.argv.includes("--l1");
const si = process.argv.indexOf("--split"), split = si > 0 ? process.argv[si + 1] : "all";
if (!indexState().fresh) await buildIndex({ quiet: true });
const sets = { dev: [...CASES, ...V.dev_new], test: V.test };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : 0; };
const out = {};
for (const [name, cases] of Object.entries(sets)) {
  if (split !== "all" && split !== name) continue;
  let hit = 0, top1 = 0, prec = 0, l1calls = 0; const ms = [], rows = [];
  for (const [q, exp] of cases) {
    const t0 = performance.now();
    const r = await route(q, { useL1: l1, log: false });
    const dt = performance.now() - t0; ms.push(dt);
    const p = r.picked;
    const h = exp.length ? p.some((s) => exp.includes(s)) : p.length === 0;
    const t = exp.length ? exp.includes(p[0]) : p.length === 0;
    const pr = exp.length ? (p.length ? p.filter((x) => exp.includes(x)).length / p.length : 0) : (p.length ? 0 : 1);
    if (r.l1?.status && r.l1.status !== "skipped" && !r.l1.cached) l1calls++;
    hit += h; top1 += t; prec += pr; rows.push({ q, picked: p, exp, hit: h, top1: t, prec: +pr.toFixed(2), l1: r.l1?.status, conf: r.conf, ms: +dt.toFixed(1) });
  }
  out[name] = { n: cases.length, hit5: hit, top1, precision: +(prec / cases.length).toFixed(3), l1_calls: l1calls, l1_pct: +(100 * l1calls / cases.length).toFixed(1), p50_ms: pct(ms, 0.5), p95_ms: pct(ms, 0.95), rows };
}
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else for (const [k, v] of Object.entries(out)) {
  for (const r of v.rows) if (!r.hit || r.prec < 1) console.log(`  ${r.hit ? "HIT " : "MISS"} p=${r.prec} [${r.l1}] ${r.q} → ${r.picked.join(",") || "-"}`);
  console.log(`${k}: n=${v.n} hit@5=${v.hit5} top1=${v.top1} precision=${v.precision} L1=${v.l1_pct}% p50=${v.p50_ms}ms p95=${v.p95_ms}ms`);
}
