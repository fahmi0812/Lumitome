/**
 * Wave 4 (T4.1 - T4.4): SandboxProvider, BYOP Guardrail Shadow Mode,
 * Dual-Mode Eval Harness (RPL-01..RPL-09), dan SHarP Ablation/Pruning.
 * Dijalankan otomatis oleh tests/run.mjs (npm test).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ok, finish } from "./harness.mjs";
import {
  NoopSandbox,
  BwrapSandbox,
  RemoteSandboxAdapter,
  createSandboxProvider,
  normalizeSandboxMode,
} from "../harness/sandbox/provider.mjs";
import {
  DEFAULT_BYOP_TIMEOUT_MS,
  buildGuardrailPayload,
  verifyProbeEligibility,
  resolveByopMode,
  resolve9RouterChatUrl,
  evaluateByopGuardrail,
} from "../harness/byop-guardrail.mjs";
import * as byopAlias from "../harness/byop-guard.mjs";
import { runReplayEval, runLiveEval } from "../scripts/eval-harness.mjs";
import {
  PERMANENT_INVARIANTS,
  PRUNABLE_FLAGS,
  assertPrunableTarget,
  decideSharpRecommendation,
  runSharpAblation,
} from "../scripts/sharp-ablation.mjs";

const tmpRoot = path.join(process.cwd(), ".tmp");
fs.mkdirSync(tmpRoot, { recursive: true });
const workRoot = fs.mkdtempSync(path.join(tmpRoot, "w4-eval-"));

try {
  // 1) T4.1 SandboxProvider
  {
    const ws = path.join(workRoot, "sbx-ws");
    fs.mkdirSync(ws, { recursive: true });

    const defProv = createSandboxProvider({}, { workspace: ws });
    const offProv = createSandboxProvider({ LUMI_SANDBOX: "off" }, { workspace: ws });
    const noopExec = await defProv.exec("echo noop_ok", { workspaceDir: ws });
    const noopWrap = defProv.wrapCommand("ls -la");
    await defProv.cleanup();

    ok(
      "T4.1 SandboxProvider: default/off memakai NoopSandbox (5 method kanonis + $0)",
      defProv instanceof NoopSandbox
        && offProv instanceof NoopSandbox
        && defProv.name === "noop"
        && defProv.isAvailable() === true
        && noopWrap.command === "ls -la"
        && noopExec.exitCode === 0
        && noopExec.stdout.includes("noop_ok"),
    );

    let bwrapMissingErr = "";
    try {
      createSandboxProvider({ LUMI_SANDBOX: "bwrap" }, { workspace: ws, bwrapAvailable: () => false });
    } catch (e) {
      bwrapMissingErr = String(e?.message || e);
    }
    const bwrapDirect = new BwrapSandbox({ workspace: ws, bwrapAvailable: () => false });
    let bwrapWrapErr = "";
    try {
      bwrapDirect.wrapCommand("echo x");
    } catch (e) {
      bwrapWrapErr = String(e?.message || e);
    }

    const argsDir = path.join(ws, ".tmp", "sbx");
    const bwrapReady = createSandboxProvider(
      { LUMI_SANDBOX: "bwrap" },
      { workspace: ws, argsDir, bwrapAvailable: () => true },
    );
    const wrapped = bwrapReady.wrapCommand("echo sandboxed", { workspaceDir: ws });
    const argsFilesBefore = fs.existsSync(argsDir) ? fs.readdirSync(argsDir) : [];
    await bwrapReady.cleanup();
    const argsFilesAfter = fs.existsSync(argsDir) ? fs.readdirSync(argsDir) : [];

    ok(
      "T4.1 BwrapSandbox: fail-closed SANDBOX_CLOSED bila bwrap absen; wrapCommand pakai --args 3 & cleanup hapus temp .args",
      /SANDBOX_CLOSED/.test(bwrapMissingErr)
        && /SANDBOX_CLOSED/.test(bwrapWrapErr)
        && bwrapReady instanceof BwrapSandbox
        && bwrapReady.name === "bwrap"
        && /^bwrap --args 3 /.test(wrapped.command)
        && argsFilesBefore.length === 1
        && argsFilesAfter.length === 0,
    );

    let remoteMissingErr = "";
    try {
      createSandboxProvider({ LUMI_SANDBOX: "remote" }, { workspace: ws });
    } catch (e) {
      remoteMissingErr = String(e?.message || e);
    }
    let unknownModeErr = "";
    try {
      normalizeSandboxMode("docker");
    } catch (e) {
      unknownModeErr = String(e?.message || e);
    }

    const lumiHome = path.join(workRoot, "sbx-lumihome");
    const remoteOk = createSandboxProvider(
      {
        LUMI_SANDBOX: "remote",
        LUMI_SANDBOX_REMOTE_URL: "https://sandbox.example.local/exec",
        LUMI_SANDBOX_REMOTE_KEY: "tok-test-only",
      },
      {
        workspace: ws,
        lumiHome,
        fetchImpl: async () => ({ ok: true, json: async () => ({ exitCode: 0, stdout: "remote-ok", stderr: "" }) }),
      },
    );
    let credMountDenied = 0;
    for (const badMount of [
      path.join(lumiHome, "credentials.json"),
      "~/.ssh/id_ed25519",
      ".env",
      "secrets.env",
    ]) {
      try {
        await remoteOk.prepare({ mounts: [badMount] });
      } catch (e) {
        if (/SANDBOX_CREDENTIAL_MOUNT_DENIED/.test(String(e?.message || e))) credMountDenied++;
      }
    }
    let credEnvDenied = false;
    try {
      await remoteOk.prepare({ env: { LUMI_KEY_9ROUTER: "secret" } });
    } catch (e) {
      credEnvDenied = /SANDBOX_CREDENTIAL_MOUNT_DENIED/.test(String(e?.message || e));
    }
    const remoteExec = await remoteOk.exec("echo hi");
    await remoteOk.cleanup();

    ok(
      "T4.1 RemoteSandboxAdapter & factory: fail-closed tanpa endpoint/mode tak dikenal, tolak mount & env kredensial",
      remoteOk instanceof RemoteSandboxAdapter
        && /SANDBOX_CLOSED/.test(remoteMissingErr)
        && /SANDBOX_CLOSED/.test(unknownModeErr)
        && credMountDenied === 4
        && credEnvDenied === true
        && remoteExec.exitCode === 0
        && remoteExec.stdout === "remote-ok",
    );
  }

  // 2) T4.2 BYOP Guardrail Shadow Mode
  {
    const byopHome = path.join(workRoot, "byop-home");
    fs.mkdirSync(byopHome, { recursive: true });
    const fakeSecret = ["sk", "proj", "byopsecret998877"].join("-");
    const chatUrl = resolve9RouterChatUrl({});

    const payload = buildGuardrailPayload({
      actionClass: "commit",
      toolName: "edit",
      sanitizedArgs: {
        filePath: "src/app.mjs",
        content: `const k = "${fakeSecret}";`,
        history: [{ role: "user", content: "secret conversation history" }],
        messages: ["narasi panjang"],
        reasoning: "<think>hidden thought</think>alasan builder",
        promptHistory: "old prompt",
      },
      taintState: "tainted",
    });
    const payloadStr = JSON.stringify(payload);

    ok(
      "T4.2 BYOP payload: 9router-only URL, buang narasi/history/<think>, scrub rahasia",
      chatUrl === "http://127.0.0.1:20128/v1/chat/completions"
        && payload.url === chatUrl
        && payload.taintState === "tainted_external"
        && !payloadStr.includes("secret conversation history")
        && !payloadStr.includes("narasi panjang")
        && !payloadStr.includes("hidden thought")
        && !payloadStr.includes("old prompt")
        && !payloadStr.includes(fakeSecret)
        && typeof byopAlias.evaluateByopGuardrail === "function",
    );

    let fetchCalls = 0;
    const lookupSkip = await evaluateByopGuardrail({
      actionClass: "lookup",
      toolName: "read",
      sanitizedArgs: { path: "README.md" },
      lumiHome: byopHome,
      fetchImpl: async () => { fetchCalls++; return { ok: true, json: async () => ({ decision: "allow" }) }; },
    });
    const verifySkip = await evaluateByopGuardrail({
      actionClass: "verify",
      toolName: "shell",
      sanitizedArgs: { command: "npm test" },
      lumiHome: byopHome,
      fetchImpl: async () => { fetchCalls++; return { ok: true, json: async () => ({ decision: "allow" }) }; },
    });

    // Default shadow mode tetap allow walau classifier flag atau timeout
    const shadowFlag = await evaluateByopGuardrail({
      actionClass: "commit",
      toolName: "write",
      sanitizedArgs: { filePath: "x.mjs" },
      env: { LUMI_HOME: byopHome },
      lumiHome: byopHome,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"decision":"flag","reason":"risky"}' } }] }),
      }),
    });
    const shadowTimeout = await evaluateByopGuardrail({
      actionClass: "commit",
      toolName: "write",
      sanitizedArgs: { filePath: "y.mjs" },
      env: { LUMI_HOME: byopHome },
      lumiHome: byopHome,
      timeoutMs: 25,
      fetchImpl: async (_u, init) => new Promise((_, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error("TimeoutError"), { name: "TimeoutError" })), 100);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("TimeoutError"), { name: "TimeoutError" }));
        });
      }),
    });

    // Enforce guard keras: ditolak/downgrade ke shadow tanpa probe valid (absen / FPR>=1% / p95>350ms)
    const noProbe = resolveByopMode({ LUMI_BYOP_MODE: "enforce" }, { lumiHome: byopHome });
    const badFpr = verifyProbeEligibility({ verified: true, fpr: 0.01, p95_ms: 120, sample_count: 100 });
    const badP95 = verifyProbeEligibility({ verified: true, fpr: 0.002, p95_ms: 351, sample_count: 100 });
    const unverified = verifyProbeEligibility({ verified: false, fpr: 0.001, p95_ms: 100 });
    const goodProbe = { verified: true, fpr: 0.004, p95_ms: 210, sample_count: 200 };
    const goodElig = verifyProbeEligibility(goodProbe);

    const enforceDowngraded = await evaluateByopGuardrail({
      actionClass: "commit",
      toolName: "edit",
      sanitizedArgs: { filePath: "z.mjs" },
      env: { LUMI_BYOP_MODE: "enforce", LUMI_HOME: byopHome },
      lumiHome: byopHome,
      probeReport: { verified: true, fpr: 0.02, p95_ms: 150 },
      fetchImpl: async () => ({ ok: true, json: async () => ({ decision: "flag", reason: "high-risk" }) }),
    });

    const enforceAcceptedDeny = await evaluateByopGuardrail({
      actionClass: "commit",
      toolName: "edit",
      sanitizedArgs: { filePath: "z.mjs" },
      env: { LUMI_BYOP_MODE: "enforce", LUMI_HOME: byopHome },
      lumiHome: byopHome,
      probeReport: goodProbe,
      headless: true,
      fetchImpl: async () => ({ ok: true, json: async () => ({ decision: "flag", reason: "high-risk" }) }),
    });
    const enforceTimeoutFailClosed = await evaluateByopGuardrail({
      actionClass: "commit",
      toolName: "edit",
      sanitizedArgs: { filePath: "z2.mjs" },
      env: { LUMI_BYOP_MODE: "enforce", LUMI_HOME: byopHome },
      lumiHome: byopHome,
      probeReport: goodProbe,
      headless: false,
      timeoutMs: 25,
      fetchImpl: async () => { throw new Error("network down"); },
    });
    const enforceAllow = await evaluateByopGuardrail({
      actionClass: "commit",
      toolName: "edit",
      sanitizedArgs: { filePath: "ok.mjs" },
      env: { LUMI_BYOP_MODE: "enforce", LUMI_HOME: byopHome },
      lumiHome: byopHome,
      probeReport: goodProbe,
      fetchImpl: async () => ({ ok: true, json: async () => ({ decision: "allow", reason: "safe" }) }),
    });

    const telLines = fs.readFileSync(path.join(byopHome, "telemetry", "byop-shadow.jsonl"), "utf8").trim().split("\n");

    ok(
      "T4.2 BYOP gating & enforce guard: lookup/verify skip, shadow non-blocking, enforce downgrade tanpa probe valid (FPR<1%, p95<=350ms)",
      DEFAULT_BYOP_TIMEOUT_MS === 350
        && fetchCalls === 0
        && lookupSkip.skipped === true && verifySkip.skipped === true
        && shadowFlag.mode === "shadow" && shadowFlag.allowed === true && shadowFlag.shadowVerdict === "flag"
        && shadowTimeout.mode === "shadow" && shadowTimeout.allowed === true && shadowTimeout.timedOut === true
        && noProbe.effective === "shadow" && noProbe.downgraded === true
        && !badFpr.eligible && !badP95.eligible && !unverified.eligible && goodElig.eligible
        && enforceDowngraded.mode === "shadow" && enforceDowngraded.downgraded === true && enforceDowngraded.allowed === true
        && enforceAcceptedDeny.mode === "enforce" && enforceAcceptedDeny.allowed === false && enforceAcceptedDeny.decision === "deny"
        && enforceTimeoutFailClosed.mode === "enforce" && enforceTimeoutFailClosed.allowed === false && enforceTimeoutFailClosed.decision === "ask"
        && enforceAllow.mode === "enforce" && enforceAllow.allowed === true
        && telLines.length === 6,
    );

    // Integrasi lumitome-guard.ts dengan LUMI_SANDBOX=remote tanpa endpoint -> fail-closed
    const prevEnv = {
      LUMI_WORKSPACE: process.env.LUMI_WORKSPACE,
      LUMI_HARNESS: process.env.LUMI_HARNESS,
      LUMI_SANDBOX: process.env.LUMI_SANDBOX,
    };
    try {
      process.env.LUMI_WORKSPACE = workRoot;
      process.env.LUMI_HARNESS = path.resolve("harness/lumi-guard.mjs");
      process.env.LUMI_SANDBOX = "remote";
      let beforeRemote = null;
      const gm = await import(pathToFileURL(path.resolve("lumitome/config/plugins/lumitome-guard.ts")).href + `?t=${Date.now()}`);
      await gm.default.setup({
        location: { directory: workRoot },
        tool: { hook(n, fn) { if (n === "execute.before") beforeRemote = fn; } },
      });
      let remoteClosed = false;
      try {
        await beforeRemote({ tool: "shell", input: { command: "echo hi" } });
      } catch (e) {
        remoteClosed = /SANDBOX_CLOSED/.test(String(e));
      }
      ok("T4.1 integrasi lumitome-guard.ts: LUMI_SANDBOX=remote tanpa endpoint -> SANDBOX_CLOSED", remoteClosed);
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  // 3) T4.3 Dual-Mode Eval Suite (--mode replay & --mode live)
  {
    const replay = await runReplayEval({ repoRoot: process.cwd() });
    const ids = replay.results.map((r) => r.id);
    const failedScenarios = replay.results.filter((s) => s.status !== "PASS").map((s) => `${s.id}: ${s.error || s.status}`);
    ok(
      "T4.3 eval-harness --mode replay: 9/9 RPL-01..RPL-09 PASS deterministik offline",
      replay.ok === true
        && replay.passed === 9
        && replay.failed === 0
        && replay.total === 9
        && ids.join(",") === "RPL-01,RPL-02,RPL-03,RPL-04,RPL-05,RPL-06,RPL-07,RPL-08,RPL-09",
      () => `passed=${replay.passed}/${replay.total}, failed=[${failedScenarios.join("; ")}]`,
    );

    const liveHome = path.join(workRoot, "live-home");
    const liveOk = await runLiveEval({
      repoRoot: process.cwd(),
      env: { LUMI_HOME: liveHome },
      lumiHome: liveHome,
      byopProbe: true,
      fetchImpl: async (url) => {
        if (String(url).endsWith("/models")) {
          return { ok: true, json: async () => ({ data: [{ id: "ag/gemini-3.8-flash-high" }] }) };
        }
        return { ok: true, json: async () => ({ decision: "allow", reason: "safe" }) };
      },
    });
    const simFile = path.join(liveHome, "memory", "sim.jsonl");
    const liveDown = await runLiveEval({
      repoRoot: process.cwd(),
      env: { LUMI_HOME: liveHome },
      lumiHome: liveHome,
      fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
    });

    ok(
      "T4.3 eval-harness --mode live: probe 9router /models + --byop-probe + tulis sim.jsonl; unreachable -> ok:false",
      liveOk.ok === true
        && liveOk.reachable === true
        && liveOk.modelsCount === 1
        && liveOk.byopProbe?.eligible === true
        && fs.existsSync(simFile)
        && liveDown.ok === false
        && liveDown.reachable === false,
    );
  }

  // 4) T4.4 SHarP Ablation & Pruning Workflow
  {
    let rejectedCount = 0;
    for (const inv of PERMANENT_INVARIANTS) {
      try {
        assertPrunableTarget(inv);
      } catch (e) {
        if (e?.code === "PERMANENT_INVARIANT") rejectedCount++;
      }
    }
    const allowedPrunable = PRUNABLE_FLAGS.every((p) => assertPrunableTarget(p.flag).allowed === true);

    const sharpHome = path.join(workRoot, "sharp-home");
    const abReport = await runSharpAblation({
      repoRoot: process.cwd(),
      env: { LUMI_HOME: sharpHome },
      lumiHome: sharpHome,
      writeSim: true,
    });
    const validDecisions = new Set(["KEEP", "PRUNE", "OBSERVE"]);
    const recPrune = decideSharpRecommendation({
      baselinePassRate: 1,
      ablationPassRate: 1,
      liveMetrics: { deltaPassRate: 0, tokenCostDrops: true },
    });
    const recKeep = decideSharpRecommendation({
      baselinePassRate: 1,
      ablationPassRate: 0,
    });

    ok(
      "T4.4 SHarP ablation: tolak prune 5 invarian permanen, terima 5 flag prunable, matriks KEEP/PRUNE/OBSERVE + sim.jsonl",
      rejectedCount === PERMANENT_INVARIANTS.length
        && allowedPrunable
        && abReport.baseline.ok === true
        && abReport.baseline.passed === 9
        && abReport.matrix.length === PRUNABLE_FLAGS.length
        && abReport.matrix.every((m) => validDecisions.has(m.decision))
        && abReport.sim_written === true
        && fs.existsSync(path.join(sharpHome, "memory", "sim.jsonl"))
        && recPrune.decision === "PRUNE"
        && recKeep.decision === "KEEP",
    );
  }
} finally {
  fs.rmSync(workRoot, { recursive: true, force: true });
}

finish();
