#!/usr/bin/env node
/**
 * CLI eval harness peran /subagent (v0.3.73, P4 fullcheck).
 *
 *   lumitome role-eval [--task <id|all>] [--home <dir>] [--out <dir>]
 *                      [--model <id>] [--judge-model <id>] [--no-judge]
 *                      [--timeout-ms N] [--judge-timeout-ms N]
 *                      [--mode <label>] [--save-baseline <path>]
 *                      [--compare-baseline <path>]
 *   lumitome role-eval --list
 *   lumitome role-eval --score <runDir>
 *
 * Satu run eval = tiap golden task dijalankan headless lewat
 * `lumitome run --agent orchestrator -m <Thinking> "<prompt>"` di workspace
 * fixture-nya sendiri, lalu dinilai: checker deterministik (utama) + blind
 * judge (artefak saja) + sensus delegasi dari DB sesi + delegation-rate dari
 * metrics JSONL bila ada. Exit 0 bila eval selesai ditulis (tugas FAIL adalah
 * DATA, bukan kegagalan harness); exit 2 bila harness-nya yang gagal.
 *
 * Fakta operasional yang dipegang CLI ini (terbukti live di VM, 16 Nov 2026):
 *  - `lumitome run` tanpa stdin tertutup MENGGANTUNG (stdin pipe terbuka) —
 *    semua spawn di sini memakai stdio stdin "ignore" (tertutup /dev/null).
 *  - `lumitome run` tanpa --agent memakai agent default engine ("build"),
 *    BUKAN orchestrator — eval selalu memakai --agent orchestrator.
 *  - Sinkron file agent peran (A4, v0.3.71) DILEWATI untuk `run` — CLI
 *    menerapkan preset ke file agent SEBELUM run dan mengembalikannya
 *    sesudah run (try/finally + handler SIGINT/SIGTERM); tanpa ini anak
 *    membaca model seed (gemini) dari file agent repo.
 *  - Hook plugin server v0.3.70 TIDAK jalan di mode headless `run` (tanpa
 *    file metrik walau LUMI_DEBUG=1) — delegation-rate di sini null secara
 *    jujur; sensus DB sesi adalah sumber delegasi utama mode ini.
 *  - Exit code run 3 (DONE-GATE FAIL: file berubah tanpa perintah tes di
 *    jurnal) adalah HASIL yang diharapkan untuk task ubah-file — checker
 *    yang memutuskan lolos/gagal, bukan exit code.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TASKS, getTask, listTasks, checkTask, buildJudgePrompt, parseJudgeVerdict,
  scoreEval, renderMarkdown, DEFAULT_TIMEOUT_MS, DEFAULT_JUDGE_TIMEOUT_MS,
  FIXTURES_DIR,
} from "../harness/role-eval.mjs";
import { metricsPath, summarize } from "./subagent-metrics.mjs";
import { applyPreset } from "./apply-subagent-preset.mjs";
import { loadPreset, resolveLumiHome } from "../lumitome/lib/subagent-preset.mjs";
import { DEFAULT_MODEL } from "../lumitome/lib/default-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_DEFAULT = path.resolve(HERE, "..");
const SYNCED_FILES = [
  ".opencode/agents/thinking.md",
  ".opencode/agents/search.md",
  ".opencode/agents/builder.md",
  ".opencode/agents/reviewer.md",
  ".opencode/agents/orchestrator.md",
  ".opencode/rules/subagent.md",
];

/** Snapshot isi file-file yang disentuh applyPreset (null = tidak ada). */
function snapshotFiles(root) {
  return SYNCED_FILES.map((rel) => {
    const p = path.join(root, rel);
    let content = null;
    try { content = fs.readFileSync(p, "utf8"); } catch { /* tidak ada */ }
    return { rel, path: p, content };
  });
}

function restoreFiles(snapshot) {
  for (const { path: p, content } of snapshot) {
    try {
      if (content === null) { try { fs.unlinkSync(p); } catch { /* tetap tidak ada */ } }
      else fs.writeFileSync(p, content);
    } catch { /* restore best-effort; validate akan menangkap drift */ }
  }
}

/** Jalankan satu perintah dengan stdin tertutup, stdout+stderr ke file log. */
function runLogged({ cmd, args, cwd, env, logFile, timeoutMs }) {
  const fd = fs.openSync(logFile, "w");
  return new Promise((resolve) => {
    let timedOut = false;
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", fd, fd], env });
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5000);
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      try { fs.closeSync(fd); } catch {}
      resolve({ exitCode: null, durationMs: Date.now() - t0, timedOut, spawnError: e.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      try { fs.closeSync(fd); } catch {}
      resolve({ exitCode: code ?? 1, durationMs: Date.now() - t0, timedOut, spawnError: null });
    });
  });
}

/** Sensus delegasi via helper python (null + alasan bila tak tersedia). */
function runCensus({ root, home, beforeIds }) {
  const db = path.join(home, "data", "opencode", "opencode.db");
  const py = path.join(root, "harness", "role-eval-census.py");
  const beforeFile = path.join(os.tmpdir(), `role-eval-before-${process.pid}.json`);
  try { fs.writeFileSync(beforeFile, JSON.stringify(beforeIds)); } catch { return { census: null, reason: "gagal tulis snapshot id sesi" }; }
  try {
    const r = spawnSync("python3", [py, "--db", db, "--before", beforeFile], { encoding: "utf8", timeout: 30000 });
    if (r.error) return { census: null, reason: `python3 tidak tersedia (${r.error.message})` };
    if (r.status !== 0) return { census: null, reason: `helper sensus exit ${r.status}` };
    try {
      const parsed = JSON.parse(r.stdout);
      return { census: parsed.census ?? null, reason: parsed.reason || "" };
    } catch { return { census: null, reason: "output helper sensus bukan JSON" }; }
  } finally {
    try { fs.unlinkSync(beforeFile); } catch {}
  }
}

function listSessionIds({ root, home }) {
  const db = path.join(home, "data", "opencode", "opencode.db");
  const py = path.join(root, "harness", "role-eval-census.py");
  try {
    const r = spawnSync("python3", [py, "--db", db, "--list-ids"], { encoding: "utf8", timeout: 30000 });
    if (r.error || r.status !== 0) return [];
    return JSON.parse(r.stdout).ids ?? [];
  } catch { return []; }
}

function engineVersion(home) {
  try {
    const bin = path.join(home, "bin", "opencode");
    if (!fs.existsSync(bin)) return "unknown (engine belum terpasang di home)";
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15000 });
    const v = (r.stdout || "").trim().split("\n")[0];
    return v || "unknown";
  } catch { return "unknown"; }
}

function copyFixture(task, ws) {
  const src = path.join(FIXTURES_DIR, task.id);
  fs.mkdirSync(ws, { recursive: true });
  for (const f of task.files) {
    fs.copyFileSync(path.join(src, f), path.join(ws, f));
  }
}

async function runTask({ task, root, home, outDir, thinkingModel, judgeModel, doJudge, timeoutMs, judgeTimeoutMs, err }) {
  const taskDir = path.join(outDir, task.id);
  const ws = path.join(taskDir, "ws");
  const taskLog = path.join(taskDir, "task.log");
  const judgeLog = path.join(taskDir, "judge.log");
  fs.mkdirSync(taskDir, { recursive: true });
  copyFixture(task, ws);

  const lumitomeBin = path.join(root, "lumitome", "bin", "lumitome.mjs");
  const baseEnv = {
    ...process.env,
    LUMI_HOME: home,
    LUMI_FIRST_OUTPUT_MS: String(timeoutMs),
  };

  // 1) Terapkan preset ke file agent (A4) — kembalikan apa pun yang terjadi.
  const snapshot = snapshotFiles(root);
  let restorePending = snapshot;
  const sigHandler = () => { restoreFiles(snapshot); process.exit(130); };
  process.once("SIGINT", sigHandler);
  process.once("SIGTERM", sigHandler);
  let applyError = null;
  try {
    const loaded = loadPreset({ home, root });
    const preset = loaded.preset;
    if (!preset) applyError = "preset /subagent tidak bisa dibaca";
    else {
      const r = applyPreset({ root, preset, liveModels: null });
      if (r.errors.length) applyError = `preset gagal diterapkan ke file agent: ${r.errors.join("; ")}`;
    }
  } catch (e) { applyError = `preset gagal diterapkan: ${e.message}`; }
  if (applyError) {
    restoreFiles(snapshot);
    process.removeListener("SIGINT", sigHandler);
    process.removeListener("SIGTERM", sigHandler);
    const result = { taskId: task.id, pass: false, checks: [], judgeVerdict: null, census: null, delegationRate: null, durationMs: null, exitCode: null, timedOut: false, error: applyError };
    fs.writeFileSync(path.join(taskDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  }

  // 2) Snapshot sesi + offset metrik, lalu jalankan task (stdin tertutup).
  const beforeIds = listSessionIds({ root, home });
  const mPath = metricsPath(home);
  let metricsOffset = 0;
  try { metricsOffset = fs.statSync(mPath).size; } catch { metricsOffset = 0; }
  let run;
  try {
    run = await runLogged({
      cmd: process.execPath,
      args: [lumitomeBin, "run", "--agent", "orchestrator", "-m", thinkingModel, task.prompt],
      cwd: ws, env: baseEnv, logFile: taskLog, timeoutMs,
    });
  } finally {
    restoreFiles(snapshot);
    restorePending = null;
    process.removeListener("SIGINT", sigHandler);
    process.removeListener("SIGTERM", sigHandler);
  }
  if (run.spawnError) {
    const result = { taskId: task.id, pass: false, checks: [], judgeVerdict: null, census: null, delegationRate: null, durationMs: run.durationMs, exitCode: run.exitCode, timedOut: run.timedOut, error: `gagal menjalankan lumitome run: ${run.spawnError}` };
    fs.writeFileSync(path.join(taskDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  }

  // 3) Sensus delegasi + delegation-rate (delta metrik di jendela run ini).
  const { census, reason } = runCensus({ root, home, beforeIds });
  if (!census && err) err(`role-eval ${task.id}: sensus tidak tersedia (${reason})`);
  let delegationRate = null;
  try {
    const buf = fs.readFileSync(mPath, "utf8");
    const delta = buf.slice(metricsOffset).split("\n").filter(Boolean);
    if (delta.length) {
      const summary = summarize(delta);
      const sess = census ? summary.sessions.find((s) => s.sessionID === census.parentId) : null;
      if (sess) delegationRate = sess.delegationRate;
    }
  } catch { /* file metrik tidak ada = null (jujur, mode headless) */ }

  // 4) Checker deterministik (utama).
  const checked = checkTask(task, ws);

  // 5) Blind judge: artefak saja, tanpa diagnosis/transkrip.
  let judgeVerdict = null;
  if (doJudge) {
    const artifacts = {};
    for (const f of task.files) {
      try { artifacts[f] = fs.readFileSync(path.join(ws, f), "utf8"); } catch { artifacts[f] = null; }
    }
    const judgePrompt = buildJudgePrompt(task, artifacts);
    const jr = await runLogged({
      cmd: process.execPath,
      args: [lumitomeBin, "run", "--agent", "orchestrator", "-m", judgeModel, judgePrompt],
      cwd: ws,
      env: { ...baseEnv, LUMI_FIRST_OUTPUT_MS: String(judgeTimeoutMs) },
      logFile: judgeLog, timeoutMs: judgeTimeoutMs,
    });
    if (!jr.spawnError) {
      try { judgeVerdict = parseJudgeVerdict(fs.readFileSync(judgeLog, "utf8")); }
      catch { judgeVerdict = null; }
      if (!judgeVerdict && err) err(`role-eval ${task.id}: verdict judge tidak terbaca (lihat ${judgeLog})`);
    } else if (err) err(`role-eval ${task.id}: judge gagal dijalankan (${jr.spawnError})`);
    fs.writeFileSync(path.join(taskDir, "judge-result.json"), JSON.stringify({ verdict: judgeVerdict, exitCode: jr.exitCode, durationMs: jr.durationMs, timedOut: jr.timedOut }, null, 2) + "\n");
  }

  const result = {
    taskId: task.id,
    pass: checked.pass,
    checks: checked.checks,
    judgeVerdict,
    census,
    censusReason: census ? "" : reason,
    delegationRate,
    durationMs: run.durationMs,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
  };
  fs.writeFileSync(path.join(taskDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

function printSummary(result, log) {
  const s = result.scores;
  log([
    `role-eval: tugas lolos ${s.tasksPassed}/${s.tasksTotal} (checker) · judge ${s.tasksPassedJudge}/${s.judgeTotal} (kesepakatan ${s.judgeAgreement === null ? "-" : `${(s.judgeAgreement * 100).toFixed(0)}%`})`,
    `role-eval: delegasi penuh 4 peran ${s.fullDelegation}/${s.censusTotal} tugas · delegation-rate median ${s.delegationRateMedian === null ? "tidak terukur" : `${(s.delegationRateMedian * 100).toFixed(0)}%`} (terukur ${s.delegationRateMeasured}/${s.tasksTotal})`,
    `role-eval: hasil di ${result.outDir}/result.json + report.md`,
  ].join("\n"));
}

function diffBaseline(scores, baseline) {
  const out = [];
  const d = (label, a, b, fmt = (v) => String(v)) => {
    if (typeof a === "number" && typeof b === "number") {
      const delta = a - b;
      out.push(`${label}: ${fmt(a)} (baseline ${fmt(b)}, ${delta === 0 ? "sama" : delta > 0 ? `+${delta}` : `${delta}`})`);
    }
  };
  d("tugas lolos", scores.tasksPassed, baseline.tasksPassed);
  d("judge lolos", scores.tasksPassedJudge, baseline.tasksPassedJudge);
  d("delegasi penuh", scores.fullDelegation, baseline.fullDelegation);
  if (typeof scores.delegationRateMedian === "number" && typeof baseline.delegationRateMedian === "number") {
    d("delegation-rate median", scores.delegationRateMedian, baseline.delegationRateMedian, (v) => `${(v * 100).toFixed(0)}%`);
  }
  return out;
}

export async function cli({ argv = process.argv.slice(2), root = REPO_DEFAULT, home, log = console.log, err = (m) => process.stderr.write(m + "\n") } = {}) {
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const num = (f, fallback) => { const v = Number(val(f)); return Number.isFinite(v) && v > 0 ? v : fallback; };
  home = home ?? val("--home") ?? resolveLumiHome();

  if (argv.includes("--list")) {
    for (const t of listTasks()) log(`${t.id} — ${t.title}`);
    return 0;
  }

  if (val("--score")) {
    const runDir = val("--score");
    const results = [];
    for (const task of TASKS) {
      const taskDir = path.join(runDir, task.id);
      const resultFile = path.join(taskDir, "result.json");
      if (!fs.existsSync(resultFile)) continue;
      let saved;
      try { saved = JSON.parse(fs.readFileSync(resultFile, "utf8")); } catch { err(`role-eval --score: ${resultFile} bukan JSON valid`); return 2; }
      const ws = path.join(taskDir, "ws");
      const checked = fs.existsSync(ws) ? checkTask(task, ws) : { pass: saved.pass, checks: saved.checks ?? [] };
      results.push({ ...saved, pass: checked.pass, checks: checked.checks });
    }
    if (!results.length) { err(`role-eval --score: tidak ada result.json task di ${runDir}`); return 2; }
    const scores = scoreEval(results);
    log([
      `role-eval --score ${runDir}: tugas lolos ${scores.tasksPassed}/${scores.tasksTotal} (checker) · judge ${scores.tasksPassedJudge}/${scores.judgeTotal} · delegasi penuh ${scores.fullDelegation}/${scores.censusTotal}`,
      `delegation-rate median: ${scores.delegationRateMedian === null ? "tidak terukur" : `${(scores.delegationRateMedian * 100).toFixed(0)}%`}`,
    ].join("\n"));
    return 0;
  }

  // --- mode run ---
  const taskArg = val("--task") || "all";
  const tasks = taskArg === "all" ? TASKS : [getTask(taskArg)];
  if (!tasks[0]) { err(`role-eval: task tidak dikenal '${taskArg}' (yang ada: ${TASKS.map((t) => t.id).join(", ")})`); return 2; }
  const loaded = loadPreset({ home, root });
  const preset = loaded.preset;
  if (!preset) { err(`role-eval: preset /subagent tidak bisa dibaca (${home})`); return 2; }
  for (const w of loaded.warnings || []) err(`peringatan: ${w}`);
  const thinkingModel = val("--model") || preset.roles?.thinking?.model || DEFAULT_MODEL;
  const judgeModel = val("--judge-model") || thinkingModel;
  const doJudge = !argv.includes("--no-judge");
  const timeoutMs = num("--timeout-ms", DEFAULT_TIMEOUT_MS);
  const judgeTimeoutMs = num("--judge-timeout-ms", DEFAULT_JUDGE_TIMEOUT_MS);
  const mode = val("--mode") || "live";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = val("--out") || path.join(process.cwd(), `role-eval-${stamp}`);
  try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { err(`role-eval: out dir tidak bisa dibuat (${outDir}): ${e.message}`); return 2; }

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const results = [];
  for (const task of tasks) {
    log(`role-eval: task ${task.id} — ${task.title} ...`);
    const r = await runTask({ task, root, home, outDir, thinkingModel, judgeModel, doJudge, timeoutMs, judgeTimeoutMs, err });
    results.push(r);
    log(`role-eval: ${task.id} ${r.pass ? "PASS" : "FAIL"}${r.judgeVerdict ? ` (judge ${r.judgeVerdict.verdict})` : " (judge -)"}${r.census ? ` [${r.census.rolesDelegated.join(",") || "-"}]` : " [sensus -]"} ${((r.durationMs ?? 0) / 1000).toFixed(1)}s`);
  }

  const result = {
    version: "0.3.73",
    mode,
    engine: engineVersion(home),
    startedAt,
    durationMs: Date.now() - t0,
    preset: {
      enabled: preset.enabled !== false,
      thinking: preset.roles?.thinking?.model ?? null,
      search: preset.roles?.search?.model ?? null,
      build: preset.roles?.builder?.model ?? null,
      review: preset.roles?.reviewer?.model ?? null,
    },
    outDir,
    scores: scoreEval(results),
  };
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "report.md"), renderMarkdown(result));
  printSummary(result, log);

  const saveBaseline = val("--save-baseline");
  if (saveBaseline) {
    fs.writeFileSync(saveBaseline, JSON.stringify({ ...result.scores, mode, engine: result.engine, startedAt }, null, 2) + "\n");
    log(`role-eval: baseline disimpan ke ${saveBaseline}`);
  }
  const compareBaseline = val("--compare-baseline");
  if (compareBaseline) {
    try {
      const baseline = JSON.parse(fs.readFileSync(compareBaseline, "utf8"));
      log("role-eval: banding baseline:");
      for (const line of diffBaseline(result.scores, baseline)) log(`  ${line}`);
    } catch (e) { err(`role-eval: baseline tidak bisa dibaca (${compareBaseline}): ${e.message}`); }
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await cli());
