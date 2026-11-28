#!/usr/bin/env node
/**
 * Metrik routing skill pada golden set (tests/golden-routing.json / --heldout) + telemetri per-sektor.
 * Gold = expect_skill bila ada, else skill aktif berawalan skills_hint. Kasus tanpa gold -> hanya cek sektor.
 * Mode: retrieval deterministik (tanpa L1) — angka = batas bawah sebelum Layer-1.
 * Pakai: node scripts/skill-metrics.mjs [--json] [--heldout] [--golden <path>] [--telemetry <path>] [--out <path>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, searchSkills, buildQueries, buildIndex, indexState, hintMatch, PICK_MAX, SECTORS } from "../router/skill-db.mjs";
import { layer0 } from "../router/layer0-regex.mjs";
import { resolveCompatLumiHome } from "../lumitome/lib/env-compat.mjs";

export function defaultTelemetryPath(env = process.env) {
  return path.join(resolveCompatLumiHome(env), "telemetry", "skill-routing.jsonl");
}

export function readSkillRoutingTelemetry(filePath = defaultTelemetryPath()) {
  const target = path.resolve(filePath);
  if (!fs.existsSync(target)) {
    return {
      available: false,
      path: target,
      total_events: 0,
      malformed: 0,
      skill_hits: {},
      top1_by_sector: {},
    };
  }
  const skillHits = {};
  const sectorStats = {};
  let totalEvents = 0;
  let malformed = 0;
  const raw = fs.readFileSync(target, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let ev;
    try {
      ev = JSON.parse(t);
    } catch {
      malformed++;
      continue;
    }
    if (!ev || typeof ev !== "object") {
      malformed++;
      continue;
    }
    totalEvents++;
    const sec = String(ev.sector ?? ev.sektor ?? "unknown").trim() || "unknown";
    sectorStats[sec] ||= { events: 0, top1_hits: 0, top1_hit_rate: 0 };
    sectorStats[sec].events++;
    if (ev.top1_hit === true) sectorStats[sec].top1_hits++;

    const list = [];
    if (typeof ev.skill === "string" && ev.skill) list.push(ev.skill);
    if (typeof ev.top1 === "string" && ev.top1) list.push(ev.top1);
    if (Array.isArray(ev.picked)) {
      for (const s of ev.picked) if (typeof s === "string" && s) list.push(s);
    }
    if (Array.isArray(ev.skills)) {
      for (const s of ev.skills) if (typeof s === "string" && s) list.push(s);
    }
    for (const s of new Set(list)) {
      skillHits[s] = (skillHits[s] || 0) + 1;
    }
  }
  for (const st of Object.values(sectorStats)) {
    st.top1_hit_rate = Number((st.top1_hits / (st.events || 1)).toFixed(4));
  }
  return {
    available: true,
    path: target,
    total_events: totalEvents,
    malformed,
    skill_hits: skillHits,
    top1_by_sector: sectorStats,
  };
}

export function readTokenCalibrationSummary(env = process.env) {
  const file = path.join(resolveCompatLumiHome(env), "telemetry", "token-calibration.json");
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const models = data?.models && typeof data.models === "object" ? Object.values(data.models) : [];
    const avgCache = models.length
      ? Number((models.reduce((acc, m) => acc + Number(m?.avgCacheHitRatio || 0), 0) / models.length).toFixed(4))
      : 0;
    return { models_calibrated: models.length, avg_cache_hit_ratio: avgCache };
  } catch {
    return null;
  }
}

export function detectDeadSkills(activeSkills = [], { goldenUsedSet = new Set(), telemetrySkillHits = {} } = {}) {
  const active = [...new Set(activeSkills)].sort();
  const telemetryUsed = Object.keys(telemetrySkillHits).filter((k) => (telemetrySkillHits[k] || 0) > 0);
  const telemetrySet = new Set(telemetryUsed);
  const pruningCandidates = active.filter((name) => !goldenUsedSet.has(name) && !telemetrySet.has(name));
  return {
    active_total: active.length,
    golden_used_count: goldenUsedSet.size,
    telemetry_used_count: telemetrySet.size,
    unused_count: pruningCandidates.length,
    pruning_candidates: pruningCandidates,
  };
}

export async function runSkillMetrics({
  goldenPath = "tests/golden-routing.json",
  telemetryPath = defaultTelemetryPath(),
  dbPath = "runtime/skills.db",
  env = process.env,
} = {}) {
  if (!indexState().fresh) await buildIndex({ quiet: true });
  const g = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  const db = openDb(dbPath, { readOnly: true });
  try {
    const active = db.prepare("SELECT name FROM skill WHERE status='active'").all().map((r) => r.name);
    const meta = Object.fromEntries(db.prepare("SELECT k,v FROM meta").all().map((r) => [r.k, r.v]));
    const goldOf = (c) =>
      c.expect_skill
        ? [c.expect_skill]
        : [...new Set((c.skills_hint || []).flatMap((h) => active.filter((n) => hintMatch(n, h))))];

    let l0hit = 0, l0mis = 0, withGold = 0, top1 = 0, sel5 = 0, sel5Frac = 0, cand16 = 0, cand32 = 0, zeroLoad = 0, mrrSum = 0;
    const lat = [];
    const misses = [];
    const goldenUsedSet = new Set();
    const sectorAcc = {};
    for (const sec of SECTORS) {
      sectorAcc[sec] = { cases: 0, cases_with_gold: 0, top1_hits: 0, sel5_hits: 0, l0_mismatch: 0 };
    }

    for (const c of g) {
      const sec = c.expect_sektor || "misc";
      sectorAcc[sec] ||= { cases: 0, cases_with_gold: 0, top1_hits: 0, sel5_hits: 0, l0_mismatch: 0 };
      sectorAcc[sec].cases++;

      const l0 = layer0(c.prompt);
      if (l0.hit && l0.sektor && l0.sektor !== c.expect_sektor) {
        l0mis++;
        sectorAcc[sec].l0_mismatch++;
      }
      if (l0.hit) l0hit++;

      const gold = goldOf(c);
      if (!gold.length) continue;
      withGold++;
      sectorAcc[sec].cases_with_gold++;

      const r = await searchSkills(db, buildQueries(c.prompt, l0), {
        sectors: l0.sektor ? [l0.sektor] : [],
        n: 32,
        hints: l0.skillsHint || [],
      });
      lat.push(r.retr_ms);
      const names = r.candidates.map((x) => x.name);
      const picked = names.slice(0, PICK_MAX);
      for (const p of picked) goldenUsedSet.add(p);
      if (!picked.length) zeroLoad++;
      if (gold.includes(names[0])) {
        top1++;
        sectorAcc[sec].top1_hits++;
      }
      const hit5 = gold.filter((x) => picked.includes(x)).length;
      if (hit5) {
        sel5++;
        sectorAcc[sec].sel5_hits++;
      } else {
        misses.push({ id: c.id, gold: gold.slice(0, 3), top: picked.slice(0, 3) });
      }
      sel5Frac += hit5 / gold.length;
      if (gold.some((x) => names.slice(0, 16).includes(x))) cand16++;
      if (gold.some((x) => names.includes(x))) cand32++;
      const rk = names.findIndex((x) => gold.includes(x));
      if (rk >= 0) mrrSum += 1 / (rk + 1);
    }

    lat.sort((a, b) => a - b);
    const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] ?? 0;
    const f = (x, denom = withGold) => Number((x / (denom || 1)).toFixed(4));

    const by_sector = {};
    for (const [sec, s] of Object.entries(sectorAcc)) {
      by_sector[sec] = {
        cases: s.cases,
        cases_with_gold: s.cases_with_gold,
        top1_accuracy: f(s.top1_hits, s.cases_with_gold),
        recall_at5: f(s.sel5_hits, s.cases_with_gold),
        l0_mismatch: s.l0_mismatch,
      };
    }

    const telemetry = readSkillRoutingTelemetry(telemetryPath);
    const dead_skills = detectDeadSkills(active, {
      goldenUsedSet,
      telemetrySkillHits: telemetry.skill_hits,
    });
    const token_calibration = readTokenCalibrationSummary(env);

    return {
      golden_total: g.length,
      layer0_mismatch: l0mis,
      layer0_hit: l0hit,
      cases_with_gold: withGold,
      embed: meta.embed,
      dim: Number(meta.dim),
      vec: meta.vec || null,
      top1_accuracy: f(top1),
      selected_recall_at5_any: f(sel5),
      selected_recall_at5_frac: f(sel5Frac),
      candidate_recall_at16: f(cand16),
      candidate_recall_at32: f(cand32),
      mrr_at32: f(mrrSum),
      zero_load_rate: f(zeroLoad),
      retrieval_ms_p50: pct(0.5),
      retrieval_ms_p95: pct(0.95),
      misses_at5: misses.length,
      miss_examples: misses.slice(0, 8),
      by_sector,
      telemetry: {
        available: telemetry.available,
        path: telemetry.path,
        total_events: telemetry.total_events,
        malformed: telemetry.malformed,
        top1_by_sector: telemetry.top1_by_sector,
      },
      dead_skills: {
        active_total: dead_skills.active_total,
        golden_used_count: dead_skills.golden_used_count,
        telemetry_used_count: dead_skills.telemetry_used_count,
        unused_count: dead_skills.unused_count,
        pruning_candidates: dead_skills.pruning_candidates.slice(0, 50),
      },
      ...(token_calibration ? { token_calibration } : {}),
      note: "Tanpa Layer-1 (9router). selected@5 = top-5 retrieval deterministik.",
    };
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const gi = args.indexOf("--golden");
  const heldout = args.includes("--heldout");
  const goldenPath = gi >= 0 ? args[gi + 1] : (heldout ? "tests/golden-routing-heldout.json" : "tests/golden-routing.json");
  const ti = args.indexOf("--telemetry");
  const telemetryPath = ti >= 0 ? args[ti + 1] : defaultTelemetryPath();
  const oi = args.indexOf("--out");
  const outPath = oi >= 0 ? args[oi + 1] : "runtime/metrics.json";
  const noWrite = args.includes("--no-write");

  const out = await runSkillMetrics({ goldenPath, telemetryPath });
  if (!noWrite && outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`golden=${out.golden_total} L0-mismatch=${out.layer0_mismatch} gold-cases=${out.cases_with_gold} embed=${out.embed}${out.dim ? "/" + out.dim : ""}`);
    console.log(`top-1=${out.top1_accuracy} recall@5(any)=${out.selected_recall_at5_any} recall@5(frac)=${out.selected_recall_at5_frac} cand-recall@16=${out.candidate_recall_at16} @32=${out.candidate_recall_at32} MRR=${out.mrr_at32} zero-load=${out.zero_load_rate}`);
    console.log(`retrieval p50=${out.retrieval_ms_p50}ms p95=${out.retrieval_ms_p95}ms misses@5=${out.misses_at5} unused-skills=${out.dead_skills.unused_count}/${out.dead_skills.active_total}`);
    const secLine = Object.entries(out.by_sector).map(([k, v]) => `${k}:${v.top1_accuracy}(n=${v.cases_with_gold})`).join(" ");
    console.log(`by-sector top-1: ${secLine}`);
  }
  process.exit(out.layer0_mismatch === 0 ? 0 : 1);
}
