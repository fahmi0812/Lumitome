#!/usr/bin/env node
/**
 * SHarP Ablation & Pruning Workflow (T4.4).
 *
 * Memisahkan secara tegas:
 *   1. Invarian Permanen (DILARANG di-prune):
 *      done-gate, scan-gate, lumi-guard, repro-before-edit-headless, sticky-taint
 *   2. Flag Prunable (kandidat uji ablasi):
 *      LUMI_IDLE_REDRIVE, LUMI_CASCADE, LUMI_PLAN_PREPASS, LUMI_OVERTHINK_GUARD, LUMI_EMBED_MODEL
 *
 * Menjalankan simulasi ablasi memakai runner eval-harness.mjs (--mode replay)
 * dan menghasilkan matriks rekomendasi KEEP / PRUNE / OBSERVE.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OC_VERSION } from "../lumitome/lib/engine.mjs";
import { resolveCompatLumiHome } from "../lumitome/lib/env-compat.mjs";
import { appendSim } from "../harness/memory/index.mjs";
import { runReplayEval } from "./eval-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

export const PERMANENT_INVARIANTS = Object.freeze([
  "done-gate",
  "scan-gate",
  "lumi-guard",
  "repro-before-edit-headless",
  "sticky-taint",
]);

const INVARIANT_ALIAS_RE = /^(?:done[-_]?gate|scan[-_]?gate|lumi[-_]?guard|repro[-_]?before[-_]?edit(?:[-_]?headless)?|lumi[-_]?repro[-_]?gate|sticky[-_]?taint|lumi[-_]?taint)$/i;

export const PRUNABLE_FLAGS = Object.freeze([
  {
    flag: "LUMI_IDLE_REDRIVE",
    offValue: "0",
    module: "M1",
    targetRpl: "RPL-05",
    description: "Pre-stop synthetic re-drive nudge",
  },
  {
    flag: "LUMI_CASCADE",
    alias: "LUMI_CASCADE_ROUTING",
    offValue: "0",
    module: "M2",
    targetRpl: "RPL-08",
    description: "3-tier cascade routing via 9router",
  },
  {
    flag: "LUMI_PLAN_PREPASS",
    offValue: "0",
    module: "M2",
    targetRpl: "RPL-08",
    description: "Complexity planning pre-pass (<=300 tokens)",
  },
  {
    flag: "LUMI_OVERTHINK_GUARD",
    offValue: "0",
    module: "M6",
    targetRpl: "RPL-08",
    description: "Overthinking backtrack oscillation guard",
  },
  {
    flag: "LUMI_EMBED_MODEL",
    offValue: "",
    module: "M3",
    targetRpl: "RPL-07",
    description: "Optional 9router embedding fallback for L2",
  },
]);

/**
 * Validasi apakah target boleh masuk siklus ablasi/pruning SHarP.
 * Melempar Error PERMANENT_INVARIANT bila mencoba me-prune invarian permanen.
 */
export function assertPrunableTarget(target) {
  const raw = String(target ?? "").trim();
  if (!raw) {
    throw new Error("INVALID_PRUNE_TARGET: nama target prune kosong");
  }
  const normalizedLower = raw.toLowerCase();
  if (PERMANENT_INVARIANTS.includes(normalizedLower) || INVARIANT_ALIAS_RE.test(raw)) {
    const err = new Error(`PERMANENT_INVARIANT: '${raw}' adalah invarian permanen dan DILARANG di-prune`);
    err.code = "PERMANENT_INVARIANT";
    throw err;
  }
  const match = PRUNABLE_FLAGS.find((p) => p.flag === raw || p.alias === raw);
  if (!match) {
    const err = new Error(`UNKNOWN_PRUNE_TARGET: '${raw}' bukan flag prunable terdaftar`);
    err.code = "UNKNOWN_PRUNE_TARGET";
    throw err;
  }
  return { allowed: true, target: match.flag, spec: match };
}

export function decideSharpRecommendation({
  baselinePassRate,
  ablationPassRate,
  baselineMs,
  ablationMs,
  liveMetrics = null,
} = {}) {
  const deltaPass = Number((ablationPassRate - baselinePassRate).toFixed(4));
  if (deltaPass < 0) {
    return { decision: "KEEP", deltaPassRate: deltaPass, reason: "replay-regression-when-disabled" };
  }
  if (liveMetrics && typeof liveMetrics.deltaPassRate === "number") {
    const costOrLatencyDrops = Boolean(liveMetrics.tokenCostDrops || liveMetrics.latencyDrops);
    if (liveMetrics.deltaPassRate <= 0 && costOrLatencyDrops) {
      return { decision: "PRUNE", deltaPassRate: liveMetrics.deltaPassRate, reason: "live-no-gain-with-cost-drop" };
    }
    if (liveMetrics.deltaPassRate > 0.01) {
      return { decision: "KEEP", deltaPassRate: liveMetrics.deltaPassRate, reason: "live-positive-gain" };
    }
  }
  const latencyDrops = Number(ablationMs) < Number(baselineMs);
  return {
    decision: "OBSERVE",
    deltaPassRate: deltaPass,
    reason: latencyDrops
      ? "replay-neutral-latency-lower (butuh uji --mode live sebelum PRUNE)"
      : "replay-neutral (butuh uji --mode live sebelum PRUNE/KEEP)",
  };
}

export async function runSharpAblation({
  repoRoot = DEFAULT_REPO_ROOT,
  baselinePath = path.join(repoRoot, "tests/eval/sim-baseline.jsonl"),
  env = process.env,
  writeSim = false,
  lumiHome = "",
  onlyFlags = null,
  liveMetricsByFlag = {},
} = {}) {
  const baseline = await runReplayEval({ repoRoot, baselinePath, env });
  const baseById = new Map(baseline.results.map((r) => [r.id, r]));
  const targets = Array.isArray(onlyFlags) && onlyFlags.length
    ? onlyFlags.map((f) => assertPrunableTarget(f).spec)
    : PRUNABLE_FLAGS;

  const matrix = [];
  const home = lumiHome ? path.resolve(lumiHome) : resolveCompatLumiHome(env);
  let simPath = null;

  for (const spec of targets) {
    const toggledEnv = { ...env, [spec.flag]: spec.offValue };
    if (spec.alias) toggledEnv[spec.alias] = spec.offValue;

    const ab = await runReplayEval({
      repoRoot,
      baselinePath,
      env: toggledEnv,
      only: [spec.targetRpl],
    });
    const baseRow = baseById.get(spec.targetRpl);
    const abRow = ab.results[0];
    const basePass = baseRow?.status === "PASS" ? 1 : 0;
    const abPass = abRow?.status === "PASS" ? 1 : 0;
    const rec = decideSharpRecommendation({
      baselinePassRate: basePass,
      ablationPassRate: abPass,
      baselineMs: baseRow?.durationMs ?? 0,
      ablationMs: abRow?.durationMs ?? 0,
      liveMetrics: liveMetricsByFlag[spec.flag] || null,
    });

    const row = {
      flag: spec.flag,
      off_value: spec.offValue,
      module: spec.module,
      target_rpl: spec.targetRpl,
      description: spec.description,
      baseline_status: baseRow?.status || "FAIL",
      ablation_status: abRow?.status || "FAIL",
      baseline_ms: baseRow?.durationMs ?? 0,
      ablation_ms: abRow?.durationMs ?? 0,
      delta_pass_rate: rec.deltaPassRate,
      decision: rec.decision,
      reason: rec.reason,
    };
    matrix.push(row);

    if (writeSim) {
      const appended = appendSim(
        {
          id: `sim_ablation_${spec.flag.toLowerCase()}_${Date.now()}`,
          ts: new Date().toISOString(),
          model_id: "9router/replay-offline",
          opencode_version: String(env?.LUMI_ENGINE_VERSION || OC_VERSION),
          ablation_target: `${spec.flag}=${spec.offValue}`,
          prunable_module: spec.module,
          observed: {
            replay_pass: abPass,
            baseline_ms: row.baseline_ms,
            ablation_ms: row.ablation_ms,
          },
          regression: abPass < basePass,
          decision: rec.decision,
        },
        { lumiHome: home },
      );
      simPath = appended.path;
    }
  }

  return {
    version: 1,
    permanent_invariants: [...PERMANENT_INVARIANTS],
    prunable_flags: PRUNABLE_FLAGS.map((p) => p.flag),
    baseline: {
      ok: baseline.ok,
      passed: baseline.passed,
      total: baseline.total,
      durationMs: baseline.durationMs,
    },
    matrix,
    sim_written: Boolean(writeSim),
    sim_path: simPath,
  };
}

function parseCliArgs(argv) {
  const opts = { json: false, writeSim: false, pruneCheck: "", onlyFlags: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--write-sim") opts.writeSim = true;
    else if (a === "--prune-check") opts.pruneCheck = String(argv[++i] || "");
    else if (a === "--flag") opts.onlyFlags.push(String(argv[++i] || ""));
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`Argumen tidak dikenal: ${a}`);
  }
  return opts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`sharp-ablation: ${e.message}\n`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write("Pakai: node --experimental-strip-types scripts/sharp-ablation.mjs [--json] [--write-sim] [--prune-check <target>] [--flag <LUMI_*>]\n");
    process.exit(0);
  }
  if (opts.pruneCheck) {
    try {
      const check = assertPrunableTarget(opts.pruneCheck);
      if (opts.json) process.stdout.write(JSON.stringify(check, null, 2) + "\n");
      else process.stdout.write(`[ALLOW] '${check.target}' adalah flag prunable (${check.spec.module})\n`);
      process.exit(0);
    } catch (e) {
      if (opts.json) process.stdout.write(JSON.stringify({ allowed: false, code: e.code || "REJECTED", error: e.message }, null, 2) + "\n");
      else process.stderr.write(`[REJECTED] ${e.message}\n`);
      process.exit(1);
    }
  }

  let report;
  try {
    report = await runSharpAblation({
      repoRoot: DEFAULT_REPO_ROOT,
      writeSim: opts.writeSim,
      onlyFlags: opts.onlyFlags.length ? opts.onlyFlags : null,
    });
  } catch (e) {
    process.stderr.write(`sharp-ablation: ${e.message}\n`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`SHarP Baseline: ${report.baseline.passed}/${report.baseline.total} PASS (${report.baseline.durationMs}ms)\n`);
    process.stdout.write(`Permanent Invariants (NON-PRUNABLE): ${report.permanent_invariants.join(", ")}\n\n`);
    for (const row of report.matrix) {
      process.stdout.write(`[${row.decision}] ${row.flag}=${JSON.stringify(row.off_value)} (${row.module}/${row.target_rpl}) base=${row.baseline_status} ab=${row.ablation_status} delta=${row.delta_pass_rate}\n`);
    }
    if (report.sim_written) process.stdout.write(`\nsim.jsonl updated: ${report.sim_path}\n`);
  }
  process.exit(report.baseline.ok ? 0 : 1);
}
