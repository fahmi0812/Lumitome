#!/usr/bin/env node
/**
 * Dual-Mode Eval Suite (T4.3):
 *   - --mode replay: 100% deterministik offline dari tests/eval/sim-baseline.jsonl (RPL-01..RPL-09).
 *   - --mode live:   verifikasi 9router (/v1/models, p95 latency, opsional --byop-probe)
 *                    dan catat ringkasan ke ${LUMI_HOME:-$HOME/.lumitome}/memory/sim.jsonl.
 *
 * Patuh LINT-001..LINT-006, 100% 9router-only, zero /tmp (scratch di <ws>/.tmp/).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildFinalConfig, buildPolicies, scanProjectPolicies } from "../lumitome/lib/build-config.mjs";
import { ENGINE_MIN_2_4, OC_VERSION } from "../lumitome/lib/engine.mjs";
import { resolveCompat9RouterKey, resolveCompat9RouterUrl, resolveCompatLumiHome } from "../lumitome/lib/env-compat.mjs";
import { evaluateTool, classifyFileTool, classifyShell, doneGateFromJournal } from "../harness/lumi-guard.mjs";
import { checkReproBeforeEdit, recordReproProbe } from "../harness/repro-gate.mjs";
import { evaluateDoneGate } from "../harness/done-gate.ts";
import { IdleGateController, buildRedriveId } from "../lumitome/config/plugins/lumitome-idle-gate.ts";
import { initFeatures, recordWitness, promoteFeatureWithWitness, invalidateStaleWitnesses, readFeatures, readWitnesses } from "../harness/witness.mjs";
import {
  L2Ledger,
  SessionTaintTracker,
  writeGoal,
  initL1Features,
  writeProgress,
  appendDeadEnd,
  readL1State,
  promoteFact,
  promoteRule,
  readL4,
  appendSim,
} from "../harness/memory/index.mjs";
import { runSkillMetrics } from "./skill-metrics.mjs";
import { resolveCascadeModel, resolvePlanPrepass } from "../lumitome/config/plugins/lib/cascade-core.mjs";
import { HaltingWatchdog, detectOverthinking } from "../harness/watchdog.mjs";
import { buildStrippedReviewPacket } from "../harness/reviewer-packet.mjs";
import { createSandboxProvider } from "../harness/sandbox/provider.mjs";
import { evaluateByopGuardrail, verifyProbeEligibility } from "../harness/byop-guardrail.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

/** Wildcard matcher identik dengan OpenCode packages/core/src/util/wildcard.ts */
export function wildcardMatch(input, pattern, ignoreCase = false) {
  const normalized = String(input).replaceAll("\\", "/");
  let escaped = String(pattern)
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?";
  return new RegExp(`^${escaped}$`, process.platform === "win32" || ignoreCase ? "si" : "s").test(normalized);
}

/** Evaluasi policies OpenCode menggunakan semantik findLast. */
export function evaluatePolicyList(policies, action, resource) {
  const matchTarget = action === "tool.use" ? resource : resource;
  const hit = policies.filter((p) => p.action === action).findLast((p) => wildcardMatch(matchTarget, p.resource));
  return hit ? hit.effect : "allow";
}

export function loadBaselineScenarios(baselinePath = path.join(DEFAULT_REPO_ROOT, "tests/eval/sim-baseline.jsonl")) {
  const raw = fs.readFileSync(baselinePath, "utf8");
  const rows = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    rows.push(JSON.parse(t));
  }
  return rows;
}

function assertCond(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeScratchDir(repoRoot, prefix) {
  const base = path.join(repoRoot, ".tmp");
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

function initTempGitRepo(dir, branch = "feat/agent-test") {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "eval@lumitome.local"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Lumitome Eval"], { cwd: dir });
  execFileSync("git", ["checkout", "-q", "-b", branch], { cwd: dir });
}

async function runRpl01(scenario, { repoRoot }) {
  const cases = scenario.cases || {};
  const polStrict = buildPolicies({ LUMI_PROVIDER_STRICT: "1" }, true);
  const polRelax = buildPolicies({ LUMI_PROVIDER_STRICT: "0" }, true);

  for (const p of cases.strict_provider_deny || []) {
    assertCond(evaluatePolicyList(polStrict, "provider.use", p) === "deny", `provider strict harus deny ${p}`);
  }
  for (const p of cases.strict_provider_allow || []) {
    assertCond(evaluatePolicyList(polStrict, "provider.use", p) === "allow", `provider strict harus allow ${p}`);
  }
  assertCond(evaluatePolicyList(polRelax, "provider.use", "anthropic") === "allow", "LUMI_PROVIDER_STRICT=0 harus allow custom provider");

  for (const cmd of cases.deny_shell || []) {
    assertCond(evaluatePolicyList(polStrict, "tool.use", `shell:${cmd}`) === "deny", `policies harus deny shell:${cmd}`);
  }
  for (const cmd of cases.allow_shell || []) {
    assertCond(evaluatePolicyList(polStrict, "tool.use", `shell:${cmd}`) === "allow", `policies harus allow shell:${cmd}`);
  }

  const ws = makeScratchDir(repoRoot, "eval-rpl01-");
  try {
    fs.writeFileSync(path.join(ws, "opencode.jsonc"), JSON.stringify({
      policies: [
        { action: "tool.use", resource: "shell:*git push *", effect: "allow" },
        { action: "provider.use", resource: "*", effect: "allow" },
      ],
    }), "utf8");
    const scan = scanProjectPolicies(ws);
    assertCond(scan.hasPolicies === true, "scanProjectPolicies gagal mendeteksi blok policies proyek");

    const envSim = { LUMI_ENGINE_VERSION: ENGINE_MIN_2_4, LUMI_SKILLS: "0" };
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    let built;
    process.stderr.write = () => true;
    try {
      built = await buildFinalConfig({
        env: envSim,
        REPO: repoRoot,
        ROOT: path.join(repoRoot, "lumitome"),
        HOME: path.join(ws, "home"),
        WS: ws,
        CFG_DIR: path.join(repoRoot, "lumitome", "config"),
        JOURNAL: "",
        RUN_ID: "eval-rpl01",
        FRAG: { providers: {}, env: {} },
        MODEL: "9router/test-model",
        HAS_9R_ENV: true,
        TIMEOUTS: { headerTimeout: 30000, chunkTimeout: 60000, timeout: 120000 },
        TRUST: true,
        sub: "run",
        prompt: "",
      });
    } finally {
      process.stderr.write = origStderrWrite;
    }
    assertCond(envSim.OPENCODE_DISABLE_PROJECT_CONFIG === "1", "LUMI_TRUST_PROJECT=1 + policies proyek harus memaksa OPENCODE_DISABLE_PROJECT_CONFIG=1");
    assertCond(built.finalCfg?.experimental?.full_codemode === false && built.finalCfg?.experimental?.opencode_api === false, "full_codemode & opencode_api harus terkunci false");
    return { checkedDeny: cases.deny_shell.length, checkedAllow: cases.allow_shell.length };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl02(scenario, { repoRoot }) {
  const cases = scenario.cases || {};
  const ws = makeScratchDir(repoRoot, "eval-rpl02-");
  try {
    const lumiHome = path.join(ws, "lumihome");
    const repoWs = path.join(ws, "repo");
    fs.mkdirSync(lumiHome, { recursive: true });
    fs.mkdirSync(path.join(repoWs, ".tmp"), { recursive: true });
    fs.mkdirSync(path.join(repoWs, "harness"), { recursive: true });
    fs.writeFileSync(path.join(repoWs, ".env"), "SECRET_TOKEN=abc123\n", "utf8");
    fs.writeFileSync(path.join(repoWs, ".env.example"), "SECRET_TOKEN=\n", "utf8");
    fs.writeFileSync(path.join(repoWs, "harness", "lumi-guard.mjs"), "// stub\n", "utf8");
    initTempGitRepo(repoWs, "feat/agent-bypass");
    execFileSync("git", ["add", "."], { cwd: repoWs });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoWs });

    for (const code of cases.execute_deny || []) {
      const r = evaluateTool("execute", { code }, { workspace: repoWs, lumiHome, home: ws, headless: true });
      assertCond(r.effect === "deny" && r.rule === "execute-policy", `execute harus deny execute-policy untuk: ${code}`);
    }
    for (const code of cases.execute_allow || []) {
      const r = evaluateTool("execute", { code }, { workspace: repoWs, lumiHome, home: ws, headless: true });
      assertCond(r.effect === "allow", `execute harus allow untuk: ${code}`);
    }
    for (const cmd of cases.git_variants || []) {
      const r = classifyShell(cmd, { workspace: repoWs, headless: true, branch: "feat/x" });
      assertCond(r.effect === "deny" && r.rule === "push-main", `git variant harus deny push-main: ${cmd}`);
    }

    const symlinkPath = path.join(repoWs, ".tmp", "leak");
    fs.symlinkSync(path.join(repoWs, ".env"), symlinkPath);
    const symRes = classifyFileTool("read", { path: ".tmp/leak" }, { workspace: repoWs, home: ws, lumiHome });
    assertCond(symRes.effect === "deny" && symRes.rule === "symlink-escape", "symlink escape ke .env harus deny symlink-escape");

    // TCB edit tanpa maintainer trust -> DENY
    const noTrust = classifyFileTool("edit", { filePath: "harness/lumi-guard.mjs" }, {
      workspace: repoWs,
      home: ws,
      lumiHome,
      tier: "standard",
      tierSource: "default",
      branch: "feat/agent-bypass",
      env: {},
    });
    assertCond(noTrust.effect === "deny" && noTrust.rule === "tcb-protected", "TCB edit tanpa maintainer trust harus deny tcb-protected");

    // TCB edit dengan maintainer trust di branch non-main -> ALLOW
    const withTrust = classifyFileTool("edit", { filePath: "harness/lumi-guard.mjs" }, {
      workspace: repoWs,
      home: ws,
      lumiHome,
      branch: "feat/agent-bypass",
      env: { LUMI_MAINTAINER_MODE: "1" },
    });
    assertCond(withTrust.effect === "allow", "TCB edit dengan LUMI_MAINTAINER_MODE=1 di branch fitur harus allow");

    return { symlinkEscape: "deny", tcbNoTrust: "deny", tcbMaintainer: "allow" };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl03(scenario, { repoRoot }) {
  const cases = scenario.cases || {};
  const ws = makeScratchDir(repoRoot, "eval-rpl03-");
  try {
    const sid = "eval_rpl03";
    const before = checkReproBeforeEdit({
      tool: "edit",
      input: { filePath: "app.mjs" },
      taskType: "bugfix",
      workspace: ws,
      sessionId: sid,
      env: {},
    });
    assertCond(before.effect === "deny" && before.rule === "repro-gate", "bugfix tanpa repro harus deny");

    for (const p of cases.invalid_probes || []) {
      const rec = recordReproProbe({
        workspace: ws,
        sessionId: sid,
        command: "pytest",
        exitCode: p.exitCode,
        output: p.output,
      });
      assertCond(rec.classification.status === "INVALID_PROBE", `probe harus INVALID_PROBE: ${p.output}`);
      const stillDenied = checkReproBeforeEdit({
        tool: "edit",
        input: { filePath: "app.mjs" },
        taskType: "bugfix",
        workspace: ws,
        sessionId: sid,
        env: {},
      });
      assertCond(stillDenied.effect === "deny", "edit harus tetap deny setelah INVALID_PROBE");
    }

    const validRec = recordReproProbe({
      workspace: ws,
      sessionId: sid,
      command: "node --test app.test.mjs",
      exitCode: cases.valid_probe?.exitCode ?? 1,
      output: cases.valid_probe?.output ?? "AssertionError: fail",
    });
    assertCond(validRec.classification.status === "VALID_REPRO", "valid failure harus VALID_REPRO");

    const after = checkReproBeforeEdit({
      tool: "edit",
      input: { filePath: "app.mjs" },
      taskType: "bugfix",
      workspace: ws,
      sessionId: sid,
      env: {},
    });
    assertCond(after.effect === "allow", "bugfix setelah VALID_REPRO harus allow");

    const featureAllowed = checkReproBeforeEdit({
      tool: "edit",
      input: { filePath: "feat.mjs" },
      taskType: "feature",
      workspace: ws,
      sessionId: "eval_rpl03_feat",
      env: {},
    });
    assertCond(featureAllowed.effect === "allow", "non-bugfix feature harus allow");

    const headlessBypass = checkReproBeforeEdit({
      tool: "edit",
      input: { filePath: "app.mjs" },
      taskType: "bugfix",
      workspace: ws,
      sessionId: "eval_rpl03_hl",
      env: { LUMI_REPRO_GATE: "0" },
      headless: true,
      strictGate: true,
    });
    assertCond(headlessBypass.effect === "deny", "LUMI_REPRO_GATE=0 harus ditolak pada headless/strictGate");

    return { invalidProbes: (cases.invalid_probes || []).length, headlessEnforced: true };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl04(_scenario, { repoRoot }) {
  const ws = makeScratchDir(repoRoot, "eval-rpl04-");
  const prevEnv = {
    LUMI_WORKSPACE: process.env.LUMI_WORKSPACE,
    LUMI_HARNESS: process.env.LUMI_HARNESS,
    LUMI_JOURNAL: process.env.LUMI_JOURNAL,
    LUMI_SANDBOX: process.env.LUMI_SANDBOX,
    LUMI_SESSION_ID: process.env.LUMI_SESSION_ID,
  };
  try {
    const journalPath = path.join(ws, "journal.jsonl");
    process.env.LUMI_WORKSPACE = ws;
    process.env.LUMI_HARNESS = path.join(repoRoot, "harness", "lumi-guard.mjs");
    process.env.LUMI_JOURNAL = journalPath;
    process.env.LUMI_SANDBOX = "off";
    process.env.LUMI_SESSION_ID = "eval_rpl04";

    let afterH = null;
    const guardPlugin = await import(pathToFileURL(path.join(repoRoot, "lumitome", "config", "plugins", "lumitome-guard.ts")).href + `?t=${Date.now()}`);
    await guardPlugin.default.setup({
      location: { directory: ws },
      tool: { hook(name, fn) { if (name === "execute.after") afterH = fn; } },
    });

    await afterH({ tool: "shell", status: "completed", input: { command: "npm test" }, result: { output: { exitCode: 0, output: "ok 1" } } });
    await afterH({ tool: "shell", status: "completed", input: { command: "npm test" }, result: { output: { exitCode: 1, output: "not ok 1" } } });
    await afterH({ tool: "shell", status: "completed", input: { command: "npm test" }, result: { metadata: { status: "running", shellID: "sh_1" }, output: { exitCode: null } } });

    const rows = fs.readFileSync(journalPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const shellRows = rows.filter((r) => r.kind === "shell");
    const bgRows = rows.filter((r) => r.kind === "shell-bg");
    assertCond(shellRows.length === 2, "harus mencatat 2 foreground shell");
    assertCond(shellRows[0].exit === 0 && shellRows[0].ok === true, "foreground exitCode 0 harus ok:true");
    assertCond(shellRows[1].exit === 1 && shellRows[1].ok === false, "foreground exitCode 1 harus ok:false");
    assertCond(bgRows.length === 1 && bgRows[0].exit === null && bgRows[0].ok === false, "shell-bg harus exit:null & ok:false");

    const dgPass = doneGateFromJournal([shellRows[0]]);
    assertCond(dgPass.ran === 1 && dgPass.last?.exit === 0, "doneGateFromJournal pass");
    const dgFail = doneGateFromJournal([shellRows[1]]);
    assertCond(dgFail.last?.exit === 1 && evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: dgFail.last.exit }).isDone === false, "doneGateFromJournal fail");
    const dgBg = doneGateFromJournal([bgRows[0]]);
    assertCond(dgBg.ran === 0 && dgBg.bgPending === 1 && evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: dgBg.last?.exit }).isDone === false, "shell-bg harus UNRUN/FAIL pada Done-Gate");

    return { foregroundPass: true, foregroundFail: true, shellBgUnrun: true };
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl05(_scenario, { repoRoot, env = process.env }) {
  const ws = makeScratchDir(repoRoot, "eval-rpl05-");
  try {
    const synthetics = [];
    const seenIds = new Set();
    const ctx = {
      session: {
        async synthetic(params) {
          if (seenIds.has(params.id)) return { deduplicated: true };
          seenIds.add(params.id);
          synthetics.push(params);
          return { ok: true, id: params.id };
        },
      },
    };
    const ctrl = new IdleGateController({ maxRedrives: 2, env, lumiHome: ws, onWarning: () => {} });
    ctrl.onUserInput("s1");
    ctrl.markMutated("s1");

    const r1 = await ctrl.handleIdle({ sessionID: "s1", background: [], snapshot: { wrote: true, ran: 0 }, ctx });
    const flagOff = String(env?.LUMI_IDLE_REDRIVE ?? "") === "0";
    if (flagOff) {
      assertCond(r1.action === "bypass" && r1.skipReason === "flag-off", "LUMI_IDLE_REDRIVE=0 harus bypass");
      return { flagOff: true, synthetics: 0 };
    }

    const r2 = await ctrl.handleIdle({ sessionID: "s1", background: [], snapshot: { wrote: true, ran: 0 }, ctx });
    const r3 = await ctrl.handleIdle({ sessionID: "s1", background: [], snapshot: { wrote: true, ran: 0 }, ctx });
    assertCond(r1.action === "redrive" && r2.action === "redrive", "attempt 1 & 2 harus redrive");
    assertCond(r1.id === buildRedriveId("s1", 1, 1, "UNVERIFIED_STOP"), "idempoten ID harus deterministik");
    assertCond(r3.action === "circuit-open", "attempt 3 harus trip idle-circuit-open");
    assertCond(synthetics.length === 2, "harus menyuntik tepat 2 synthetic messages");

    // Bypass Q&A / question
    const ctrlQ = new IdleGateController({ maxRedrives: 2, env, lumiHome: ws, onWarning: () => {} });
    ctrlQ.markWaitingForUser("sq", true);
    const rq = await ctrlQ.handleIdle({ sessionID: "sq", background: [], snapshot: { wrote: true, ran: 0 }, ctx });
    assertCond(rq.action === "allow" && rq.skipReason === "waiting-for-user", "Q&A harus bypass");

    // Bypass BLOCKED
    const ctrlB = new IdleGateController({ maxRedrives: 2, env, lumiHome: ws, onWarning: () => {} });
    ctrlB.markBlocked("sb", true);
    const rb = await ctrlB.handleIdle({ sessionID: "sb", background: [], snapshot: { wrote: true, ran: 0 }, ctx });
    assertCond(rb.action === "allow" && rb.skipReason === "waiting-for-user", "BLOCKED harus bypass");

    // Bypass PASS
    const ctrlP = new IdleGateController({ maxRedrives: 2, env, lumiHome: ws, onWarning: () => {} });
    const rp = await ctrlP.handleIdle({
      sessionID: "sp",
      background: [],
      snapshot: { wrote: true, ran: 1, lastExit: 0, hasValidWitness: true, featuresAllPass: true, sector: "docs" },
      ctx,
    });
    assertCond(rp.action === "allow" && rp.skipReason === "verified-pass", "PASS harus allow idle");

    return { redrives: synthetics.length, circuitOpen: true, bypassesOk: true };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl06(scenario, { repoRoot }) {
  const cases = scenario.cases || {};
  const ws = makeScratchDir(repoRoot, "eval-rpl06-");
  try {
    const sDir = path.join(ws, ".tmp", "session", "ses_rpl06");
    const targetFile = path.join(ws, "mod.mjs");
    fs.writeFileSync(targetFile, "export const x = 1;\n", "utf8");
    const featId = cases.feature_id || "F-01";
    const feats = initFeatures(sDir, [{ id: featId, description: "Default-FAIL test" }]);
    assertCond(feats.features[0].passes === false && feats.features[0].status === "FAIL", "feature baru harus Default-FAIL");

    // Anti-spoof: klaim teks tanpa witness runtime ditolak
    const spoofRes = evaluateDoneGate({
      commandExitCode: 0,
      expectedArtifacts: [],
      sessionDir: sDir,
      workspace: ws,
      requireWitness: true,
      testsGreen: true,
      facts: [`FACT: ATTESTED(${cases.anti_spoof_id || "w_spoof_99"},a,b,0,head)`],
    });
    assertCond(spoofRes.isDone === false, "klaim teks ATTESTED palsu harus ditolak Done-Gate");

    const wRec = recordWitness(sDir, {
      workspace: ws,
      command: "npm test",
      output: "ok 1",
      exit_code: 0,
      targetFiles: ["mod.mjs"],
      git_head_sha: "NO_GIT",
    });
    assertCond(wRec.status === "VALID" && /^ATTESTED\(/.test(wRec.attested), "witness 5-field harus VALID");
    const prom = promoteFeatureWithWitness({
      sessionDir: sDir,
      workspace: ws,
      featureId: featId,
      witnessId: wRec.source_id,
      currentHeadSha: "NO_GIT",
    });
    assertCond(prom.ok === true && prom.feature.passes === true, "promoteFeatureWithWitness harus naik ke PASS");

    // Mutasi 1 byte pada derived_from -> witness STALE + feature UNSETTLED -> DoneGate FAIL
    fs.writeFileSync(targetFile, "export const x = 2;\n", "utf8");
    const inv = invalidateStaleWitnesses({ sessionDir: sDir, workspace: ws, currentHeadSha: "NO_GIT" });
    const wList = readWitnesses(sDir);
    const fDoc = readFeatures(sDir);
    assertCond(wList[0].status === "STALE", "witness harus menjadi STALE saat derived_from berubah");
    assertCond(fDoc.features[0].passes === false && fDoc.features[0].status === "UNSETTLED", "feature harus terdegradasi ke UNSETTLED");
    const postMut = evaluateDoneGate({
      commandExitCode: 0,
      expectedArtifacts: [],
      sessionDir: sDir,
      workspace: ws,
      requireWitness: true,
      testsGreen: true,
      facts: ["FACT: npm test exit=0"],
    });
    assertCond(postMut.isDone === false && inv.staleWitnessIds.length >= 1, "evaluateDoneGate harus FAIL setelah witness STALE");

    return { defaultFail: true, antiSpoof: true, staleInvalidation: true };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl07(scenario, { repoRoot }) {
  const cases = scenario.cases || {};
  const ws = makeScratchDir(repoRoot, "eval-rpl07-");
  try {
    const lumiHome = path.join(ws, "lumihome");
    const sid = "eval_rpl07";
    const secretVal = ["sk", "proj", "evalsecret123456"].join("-");

    // L1
    writeGoal(ws, sid, { goal: `<think>secret</think>Fix ${secretVal}`, target_files: ["a.mjs"], acceptance: ["pass"], task_type: "bugfix" });
    initL1Features(ws, sid, [{ id: "F-01", description: "Check" }]);
    writeProgress(ws, sid, "progress");
    appendDeadEnd(ws, sid, { cmd_or_action: "test", error_sig: "1", reason: `Bearer ${secretVal}` });
    const l1 = readL1State(ws, sid);
    assertCond(!fs.readFileSync(l1.paths.goal, "utf8").includes(secretVal), "L1 goal harus scrub secrets");
    assertCond(!fs.readFileSync(l1.paths.deadEnds, "utf8").includes(secretVal), "L1 dead_ends harus scrub secrets");

    // L2 FTS5 benchmark (500 turns <500ms, query <5ms)
    const ledger = new L2Ledger({ lumiHome });
    const turnCount = Number(cases.bench_turns || 500);
    const turns = [];
    for (let i = 0; i < turnCount; i++) {
      turns.push({
        session_id: sid,
        workspace: ws,
        agent: "builder",
        taint_state: i === 7 ? "tainted_external" : "clean",
        kind: "turn",
        raw_text: i === 7
          ? `external page snippet Bearer ${secretVal}`
          : `deterministic benchmark turn_${i} module validation check`,
      });
    }
    const tW0 = performance.now();
    ledger.appendTurns(turns);
    const writeMs = performance.now() - tW0;
    ledger.searchFts("turn_250 module validation", { limit: 5 });
    const queryLatencies = [];
    let hitsRes = null;
    for (let q = 0; q < 5; q++) {
      const tQ0 = performance.now();
      hitsRes = ledger.searchFts("turn_250 module validation", { limit: 5 });
      queryLatencies.push(performance.now() - tQ0);
    }
    const queryMs = percentile(queryLatencies, 50);
    const taintRes = ledger.searchFts("external page snippet", { limit: 5 });
    ledger.close();

    assertCond(hitsRes.hits.length > 0, "L2 FTS5 harus mengembalikan hasil");
    assertCond(writeMs < Number(cases.max_write_ms || 500), `L2 500-turn writeMs=${writeMs.toFixed(1)}ms melebihi 500ms`);
    assertCond(queryMs < Number(cases.max_query_ms || 5), `L2 FTS5 p50 queryMs=${queryMs.toFixed(2)}ms melebihi 5ms`);
    assertCond(taintRes.hits[0]?.taggedText?.includes("[TAINTED_EXTERNAL_DATA]") && !taintRes.hits[0]?.raw_text?.includes(secretVal), "L2 harus menandai tainted_external & scrub secret");

    // Monotonic Sticky Taint & L4 gate
    const tracker = new SessionTaintTracker({ sessionId: sid, stateFile: path.join(ws, ".tmp", "session", sid, "taint.json") });
    tracker.recordToolOrInput({ tool: "webfetch", source: "external" });
    assertCond(tracker.isTainted === true, "webfetch harus menaikkan taint ke TAINTED");
    assertCond(tracker.reset("override").rejected === true && tracker.isTainted === true, "taint tidak boleh bisa di-reset");
    const hold = promoteFact({ fact: `poisoned ${secretVal}` }, { lumiHome, taintTracker: tracker });
    assertCond(hold.promoted === false && hold.decision === "HOLD_FOR_APPROVAL", "sesi TAINTED harus menahan promosi L4");
    const l4 = readL4({ lumiHome });
    assertCond(l4.facts.length === 0 && l4.stagingTainted.length === 1, "facts.jsonl harus kosong saat TAINTED");

    return { writeMs: Number(writeMs.toFixed(1)), queryMs: Number(queryMs.toFixed(2)), taintHold: true };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl08(scenario, { repoRoot, env = process.env }) {
  const cases = scenario.cases || {};
  const ws = makeScratchDir(repoRoot, "eval-rpl08-");
  try {
    const m = await runSkillMetrics({
      goldenPath: path.join(repoRoot, cases.golden_path || "tests/golden-routing.json"),
      dbPath: path.join(repoRoot, "runtime", "skills.db"),
      telemetryPath: path.join(ws, "no-tel.jsonl"),
      env,
    });
    assertCond(m.golden_total >= Number(cases.min_cases || 154), `golden cases ${m.golden_total} < 154`);
    assertCond(m.layer0_mismatch <= Number(cases.max_l0_mismatch ?? 0), `layer0_mismatch=${m.layer0_mismatch}`);
    for (const sec of cases.sectors || []) {
      assertCond(Boolean(m.by_sector?.[sec]), `by_sector harus memuat ${sec}`);
    }
    assertCond(m.top1_accuracy >= 0.7 && m.selected_recall_at5_any >= 0.85, `akurasi router turun: top1=${m.top1_accuracy}, recall5=${m.selected_recall_at5_any}`);

    const avail = ["ag/gemini-3.8-flash-high", "ag/claude-opus-4-6"];
    const preset = { roles: { thinking: "9router/ag/claude-opus-4-6", reviewer: "9router/ag/claude-opus-4-6", builder: "9router/ag/gemini-3.8-flash-high" } };

    // providerID === "9router" invariant & non-9router passthrough
    const ext = resolveCascadeModel({ event: { kind: "primary", agent: "thinking", model: { providerID: "anthropic", id: "claude" } }, preset, availableModels: avail, env });
    assertCond(ext.model.providerID === "anthropic", "provider non-9router tidak boleh diubah");

    for (const role of cases.never_downgrade_roles || ["thinking", "reviewer", "design-critic"]) {
      const res = resolveCascadeModel({
        event: { kind: "primary", agent: role, model: { providerID: "9router", id: "ag/claude-opus-4-6" } },
        preset,
        availableModels: avail,
        state: { taskComplexity: "low" },
        env,
      });
      assertCond(res.model.providerID === "9router" && !/flash/i.test(res.model.id), `never-downgrade gagal untuk role ${role}`);
    }

    // Fallback deterministik saat availableModels kosong / tidak cocok
    const fb = resolveCascadeModel({
      event: { kind: "title", agent: "orchestrator", model: { providerID: "9router", id: "ag/custom-only" } },
      preset,
      availableModels: ["ag/custom-only"],
      env,
    });
    assertCond(fb.model.providerID === "9router" && fb.model.id === "ag/custom-only", "fallback deterministik ke model sesi gagal");

    // LUMI_PLAN_PREPASS & LUMI_OVERTHINK_GUARD
    const ppOn = resolvePlanPrepass({ role: "thinking", env: { ...env, LUMI_PLAN_PREPASS: env?.LUMI_PLAN_PREPASS ?? "1" } });
    const ppOff = resolvePlanPrepass({ role: "thinking", env: { ...env, LUMI_PLAN_PREPASS: "0" } });
    if (String(env?.LUMI_PLAN_PREPASS ?? "1") !== "0") assertCond(ppOn.active === true, "LUMI_PLAN_PREPASS default harus aktif untuk thinking");
    assertCond(ppOff.active === false, "LUMI_PLAN_PREPASS=0 harus nonaktif");

    const otSample = "on second thought, let me reconsider, let's backtrack, ganti pendekatan";
    const otOn = detectOverthinking(otSample, { env: { LUMI_OVERTHINK_GUARD: "1" } });
    const otOff = detectOverthinking(otSample, { env: { LUMI_OVERTHINK_GUARD: "0" } });
    assertCond(otOn.overthinking === true && otOff.overthinking === false, "LUMI_OVERTHINK_GUARD gagal");

    return {
      totalCases: m.golden_total,
      top1Accuracy: m.top1_accuracy,
      recall5: m.selected_recall_at5_any,
      cascadeActive: String(env?.LUMI_CASCADE ?? env?.LUMI_CASCADE_ROUTING ?? "1") !== "0",
    };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

async function runRpl09(_scenario, { repoRoot }) {
  const ws = makeScratchDir(repoRoot, "eval-rpl09-");
  try {
    // 1) HaltingWatchdog
    const dogZp = new HaltingWatchdog({ workspace: ws, sessionId: "eval_zp", persistDeadEnds: true });
    dogZp.recordStep({ tool: "edit", input: { filePath: "a.ts" }, ok: true, snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    dogZp.recordStep({ tool: "shell", input: { command: "npm test" }, ok: false, exitCode: 1, errorText: "f1", snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    dogZp.recordStep({ tool: "shell", input: { command: "npm test -- 1" }, ok: false, exitCode: 1, errorText: "f2", snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    const zp3 = dogZp.recordStep({ tool: "shell", input: { command: "npm test -- 2" }, ok: false, exitCode: 1, errorText: "f3", snapshot: { diffHash: "d1", statusHash: "s1", testStatus: "fail" } });
    assertCond(zp3.verdict === "HALT" && zp3.reason === "zero-progress-streak", "watchdog harus trip zero-progress-streak");

    const dogNg = new HaltingWatchdog({ workspace: ws, sessionId: "eval_ng", maxZeroProgressStreak: 99 });
    dogNg.recordStep({ tool: "edit", input: { filePath: "a.ts" }, ok: true, snapshot: { diffHash: "dA", statusHash: "sA" } });
    dogNg.recordStep({ tool: "shell", input: { command: "npm test" }, ok: false, exitCode: 1, errorText: "eA", snapshot: { diffHash: "dA", statusHash: "sA", testStatus: "fail" } });
    dogNg.recordStep({ tool: "edit", input: { filePath: "a.ts" }, ok: true, snapshot: { diffHash: "dB", statusHash: "sB" } });
    const ngV = dogNg.recordStep({ tool: "shell", input: { command: "npm test" }, ok: false, exitCode: 1, errorText: "eB", snapshot: { diffHash: "dB", statusHash: "sB", testStatus: "fail" } });
    assertCond(ngV.verdict === "HALT" && ngV.reason === "ngram-loop", "watchdog harus trip ngram-loop");

    const dogRes = new HaltingWatchdog({ workspace: ws, sessionId: "eval_res" });
    let rv = null;
    for (const f of ["a.ts", "b.ts", "c.ts", "d.ts"]) {
      rv = dogRes.recordStep({ tool: "read", input: { filePath: f }, ok: true, snapshot: { diffHash: "x", statusHash: "x" } });
    }
    assertCond(rv.verdict === "OK", "riset murni tidak boleh halt");

    // 2) Context-Stripped Reviewer
    const pkt = buildStrippedReviewPacket({
      spec: { goal: "Fix bug", acceptance: ["tests pass"] },
      diff: "+ const ok = true;",
      targetFiles: ["a.mjs"],
      builderNarrative: "<think>rahasia internal</think>Saya sudah sangat yakin semua benar!",
      narrative: "alasan subyektif builder",
      chatHistory: [{ role: "user", content: "halo" }],
      witnesses: [{ source_id: "w_1", status: "VALID", exit_code: 0, cmd_sha256: "a".repeat(64), output_sha256: "b".repeat(64), git_head_sha: "HEAD", attested: "ATTESTED(w_1,a,b,0,HEAD)" }],
    });
    const pktJson = JSON.stringify(pkt);
    assertCond(!pktJson.includes("rahasia internal") && !pktJson.includes("alasan subyektif") && pktJson.includes("Fix bug"), "context-stripped reviewer harus membuang narasi & CoT builder");

    // 3) SandboxProvider
    const noop = createSandboxProvider({}, { workspace: ws });
    assertCond(noop.name === "noop" && noop.isAvailable() === true, "default SandboxProvider harus NoopSandbox");
    let bwrapClosed = false;
    try {
      createSandboxProvider({ LUMI_SANDBOX: "bwrap" }, { workspace: ws, bwrapAvailable: () => false });
    } catch (e) {
      bwrapClosed = /SANDBOX_CLOSED/.test(String(e));
    }
    assertCond(bwrapClosed, "BwrapSandbox tanpa bwrap harus fail-closed SANDBOX_CLOSED");

    // 4) BYOP shadow downgrade guard
    const byopRes = await evaluateByopGuardrail({
      actionClass: "commit",
      toolName: "edit",
      sanitizedArgs: { filePath: "a.mjs", history: "should be stripped", secret: "Bearer topsecret123456" },
      taintState: "clean",
      env: { LUMI_BYOP_MODE: "enforce", LUMI_HOME: ws },
      lumiHome: ws,
      fetchImpl: async () => ({ ok: true, json: async () => ({ decision: "flag", reason: "test-flag" }) }),
    });
    assertCond(byopRes.mode === "shadow" && byopRes.downgraded === true && byopRes.allowed === true, "BYOP enforce tanpa probeReport valid harus downgrade ke shadow & non-blocking");
    assertCond(!JSON.stringify(byopRes.payload).includes("should be stripped") && !JSON.stringify(byopRes.payload).includes("topsecret123456"), "BYOP payload harus ter-strip & ter-scrub");

    return { watchdog: true, reviewerStripped: true, sandboxFailClosed: true, byopDowngraded: true };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

const SCENARIO_RUNNERS = {
  "RPL-01": runRpl01,
  "RPL-02": runRpl02,
  "RPL-03": runRpl03,
  "RPL-04": runRpl04,
  "RPL-05": runRpl05,
  "RPL-06": runRpl06,
  "RPL-07": runRpl07,
  "RPL-08": runRpl08,
  "RPL-09": runRpl09,
};

export async function runReplayEval({
  repoRoot = DEFAULT_REPO_ROOT,
  baselinePath = path.join(repoRoot, "tests/eval/sim-baseline.jsonl"),
  env = process.env,
  only = null,
} = {}) {
  const t0 = performance.now();
  const scenarios = loadBaselineScenarios(baselinePath);
  const filtered = Array.isArray(only) && only.length ? scenarios.filter((s) => only.includes(s.id)) : scenarios;
  const results = [];

  for (const sc of filtered) {
    const s0 = performance.now();
    const runner = SCENARIO_RUNNERS[sc.id];
    if (!runner) {
      results.push({ id: sc.id, module: sc.module, status: "FAIL", durationMs: 0, error: `Runner tidak ditemukan untuk ${sc.id}` });
      continue;
    }
    try {
      const details = await runner(sc, { repoRoot, env });
      results.push({
        id: sc.id,
        module: sc.module,
        status: "PASS",
        durationMs: Number((performance.now() - s0).toFixed(2)),
        details,
      });
    } catch (e) {
      results.push({
        id: sc.id,
        module: sc.module,
        status: "FAIL",
        durationMs: Number((performance.now() - s0).toFixed(2)),
        error: String(e?.message || e),
      });
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.length - passed;
  return {
    mode: "replay",
    ok: failed === 0 && results.length > 0,
    passed,
    failed,
    total: results.length,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    baselinePath,
    results,
  };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(2));
}

export async function runLiveEval({
  repoRoot = DEFAULT_REPO_ROOT,
  env = process.env,
  byopProbe = false,
  model = "",
  fetchImpl = globalThis.fetch,
  lumiHome = "",
} = {}) {
  const t0 = performance.now();
  const home = lumiHome ? path.resolve(lumiHome) : resolveCompatLumiHome(env);
  const baseUrl = resolveCompat9RouterUrl(env).replace(/\/+$/, "");
  const modelsUrl = `${baseUrl}/models`;
  const apiKey = resolveCompat9RouterKey(env);
  const headers = {
    accept: "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };

  const latencies = [];
  let reachable = false;
  let modelIds = [];
  let connectError = null;

  for (let i = 0; i < 3; i++) {
    const s0 = performance.now();
    try {
      const res = await fetchImpl(modelsUrl, { headers, signal: AbortSignal.timeout(3000) });
      const ms = performance.now() - s0;
      if (res && res.ok) {
        reachable = true;
        latencies.push(ms);
        if (i === 0) {
          const data = await res.json();
          modelIds = (data?.data || data?.models || []).map((m) => String(m?.id || m?.name || "")).filter(Boolean);
        }
      } else {
        connectError = `HTTP ${res?.status ?? "unknown"}`;
      }
    } catch (e) {
      connectError = String(e?.message || e);
    }
  }

  const p50Ms = percentile(latencies, 50);
  const p95Ms = percentile(latencies, 95);

  let byopResult = null;
  if (byopProbe && reachable) {
    const probeLatencies = [];
    let falsePositives = 0;
    const samples = 5;
    for (let i = 0; i < samples; i++) {
      const r = await evaluateByopGuardrail({
        actionClass: "commit",
        toolName: "edit",
        sanitizedArgs: { filePath: `src/probe_${i}.mjs` },
        taintState: "clean",
        env: { ...env, LUMI_BYOP_MODE: "shadow" },
        lumiHome: home,
        model: model || modelIds[0] || undefined,
        fetchImpl,
      });
      probeLatencies.push(r.latencyMs);
      if (r.shadowVerdict === "flag") falsePositives++;
    }
    const report = {
      verified: true,
      fpr: Number((falsePositives / samples).toFixed(4)),
      p95_ms: percentile(probeLatencies, 95),
      sample_count: samples,
      ts: new Date().toISOString(),
    };
    const elig = verifyProbeEligibility(report);
    byopResult = { ...report, ...elig };
  }

  const simEntry = {
    id: `sim_live_${Date.now()}`,
    ts: new Date().toISOString(),
    model_id: model ? (model.startsWith("9router/") ? model : `9router/${model}`) : (modelIds[0] ? `9router/${modelIds[0]}` : "9router/unknown"),
    opencode_version: String(env?.LUMI_ENGINE_VERSION || OC_VERSION || ENGINE_MIN_2_4),
    ablation_target: "live_probe",
    prunable_module: "M5",
    observed: {
      reachable,
      models_count: modelIds.length,
      p50_ms: p50Ms,
      p95_ms: p95Ms,
      ...(byopResult ? { byop_probe: byopResult } : {}),
    },
    regression: !reachable,
    decision: reachable ? "OBSERVE" : "UNAVAILABLE",
  };

  let simPath = null;
  try {
    const appended = appendSim(simEntry, { lumiHome: home });
    simPath = appended.path;
  } catch {
    simPath = path.join(home, "memory", "sim.jsonl");
  }

  return {
    mode: "live",
    ok: reachable,
    url: modelsUrl,
    reachable,
    modelsCount: modelIds.length,
    p50_ms: p50Ms,
    p95_ms: p95Ms,
    byopProbe: byopResult,
    simPath,
    error: reachable ? null : (connectError || "9router unreachable"),
    durationMs: Number((performance.now() - t0).toFixed(2)),
    repoRoot,
  };
}

function parseCliArgs(argv) {
  const opts = {
    mode: "replay",
    json: false,
    byopProbe: false,
    model: "",
    baseline: path.join(DEFAULT_REPO_ROOT, "tests/eval/sim-baseline.jsonl"),
    out: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") {
      opts.mode = String(argv[++i] || "");
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--byop-probe") {
      opts.byopProbe = true;
    } else if (a === "--model") {
      opts.model = String(argv[++i] || "");
    } else if (a === "--baseline") {
      opts.baseline = path.resolve(argv[++i] || "");
    } else if (a === "--out") {
      opts.out = path.resolve(argv[++i] || "");
    } else if (a === "--help" || a === "-h") {
      opts.help = true;
    } else {
      throw new Error(`Argumen tidak dikenal: ${a}`);
    }
  }
  if (!["replay", "live"].includes(opts.mode)) {
    throw new Error(`Mode tidak valid '${opts.mode}' (pakai: replay | live)`);
  }
  return opts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`eval-harness: ${e.message}\n`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write("Pakai: node --experimental-strip-types scripts/eval-harness.mjs --mode replay|live [--json] [--byop-probe] [--model <id>] [--baseline <path>] [--out <path>]\n");
    process.exit(0);
  }
  const report = opts.mode === "replay"
    ? await runReplayEval({ repoRoot: DEFAULT_REPO_ROOT, baselinePath: opts.baseline })
    : await runLiveEval({ repoRoot: DEFAULT_REPO_ROOT, byopProbe: opts.byopProbe, model: opts.model });

  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else if (report.mode === "replay") {
    for (const r of report.results) {
      const tag = r.status === "PASS" ? "[PASS]" : "[FAIL]";
      process.stdout.write(`${tag} ${r.id} (${r.module}) ${r.durationMs}ms${r.error ? ` — ${r.error}` : ""}\n`);
    }
    process.stdout.write(`\nReplay Eval: ${report.passed}/${report.total} PASS (${report.durationMs}ms)\n`);
  } else {
    process.stdout.write(`Live Eval (${report.url}): reachable=${report.reachable} models=${report.modelsCount} p50=${report.p50_ms}ms p95=${report.p95_ms}ms sim=${report.simPath}${report.error ? ` error=${report.error}` : ""}\n`);
  }

  process.exit(report.ok ? 0 : 1);
}
