/**
 * State machine deterministik /loopdesign (v0.4.0 Wave 0, T0.4).
 *
 * Siklus: DRAFT -> MEASURE -> GATE -> CRITIC -> PATCH -> DONE | HALT
 *
 * Menghubungkan jalur produksi:
 *   - measureAndGateWithBehavior() (harness/design-behavior.mjs)
 *   - collectDomSummary() & comparePairwise() (harness/design-pairwise.mjs)
 *   - criticInput() & nextLoopAction() (harness/design-gate.mjs)
 *   - recordLoopIteration() & stuckVerdict() (harness/design-behavior.mjs)
 *   - evaluateDoneGate() (harness/done-gate.ts)
 *
 * Syarat terminasi DONE: Design-Gate PASS + Behavior Probe PASS + Done-Gate PASS.
 * State loop disimpan di <workspace>/.tmp/loopdesign/ (nol /tmp).
 */
import { resolve } from "node:path";
import { criticInput, nextLoopAction } from "./design-gate.mjs";
import { measureAndGateWithBehavior, recordLoopIteration, stuckVerdict } from "./design-behavior.mjs";
import { collectDomSummary, comparePairwise } from "./design-pairwise.mjs";

export const LOOP_STATES = Object.freeze(["DRAFT", "MEASURE", "GATE", "CRITIC", "PATCH", "DONE", "HALT"]);
export const CRITIC_AGENT = "design-critic";

export function defaultStateDir(workspace = ".") {
  return resolve(workspace, ".tmp", "loopdesign");
}

async function runDoneGate(doneGateInput, doneGateFn) {
  if (typeof doneGateFn === "function") return doneGateFn(doneGateInput);
  if (!doneGateInput) {
    return { isDone: false, failureReason: "tidak ada bukti tes Done-Gate" };
  }
  try {
    const mod = await import("./done-gate.ts");
    return mod.evaluateDoneGate(doneGateInput);
  } catch (e) {
    return { isDone: false, failureReason: `done-gate gagal dimuat (${e?.message ?? e})` };
  }
}

function hasBehaviorFailure(findings = []) {
  return findings.some((f) => (f.check === "behavior" || f.check === "probe-gagal") && f.severity === "fail");
}

/**
 * Jalankan satu iterasi state machine /loopdesign (MEASURE -> GATE -> DONE | HALT | CRITIC -> PATCH).
 */
export async function stepDesignLoop(ctx = {}, deps = {}) {
  const {
    target,
    prevTarget = null,
    iteration = 1,
    maxIterations = 3,
    consecutiveFailures = 0,
    prevFindingsCount = null,
    workspace = ".",
    stateDir = defaultStateDir(workspace),
    brief = null,
    design = null,
    golden = null,
    mwg = undefined,
    behaviorContract = undefined,
    prevContract = undefined,
    designFile = undefined,
    measureOpts = {},
    doneGateInput = null,
  } = ctx;

  const measureFn = deps.measureFn ?? measureAndGateWithBehavior;
  const domFn = deps.domFn ?? collectDomSummary;
  const pairwiseFn = deps.pairwiseFn ?? comparePairwise;
  const criticBuilder = deps.criticBuilder ?? criticInput;
  const criticRunner = deps.criticRunner ?? null;
  const patchRunner = deps.patchRunner ?? null;
  const doneGateFn = deps.doneGateFn ?? null;

  const transitions = [];
  if (iteration === 1) transitions.push("DRAFT->MEASURE");

  // MEASURE
  const gate = await measureFn(target, { ...measureOpts, behaviorContract, designFile });
  const dom = await domFn(target);
  const pairwise = prevTarget
    ? await pairwiseFn(prevTarget, target, {
      nameA: `iter-${Math.max(1, iteration - 1)}`,
      nameB: `iter-${iteration}`,
      contractA: prevContract,
      contractB: behaviorContract,
    })
    : null;

  transitions.push("MEASURE->GATE");

  // GATE
  const findings = Array.isArray(gate?.findings) ? gate.findings : [];
  const failCount = findings.filter((f) => f.severity === "fail").length;
  const behaviorProbePassed = !hasBehaviorFailure(findings);
  const gatePass = !!gate?.pass && behaviorProbePassed;

  recordLoopIteration(stateDir, { iteration, findings: failCount, pass: gatePass, mwg });
  const stuck = stuckVerdict(stateDir);
  const improved = prevFindingsCount === null ? true : gatePass || failCount < prevFindingsCount;
  const nextConsecutiveFailures = gatePass ? 0 : consecutiveFailures + 1;

  const next = nextLoopAction({
    iteration,
    maxIterations,
    gatePass,
    improved,
    consecutiveFailures: nextConsecutiveFailures,
    stuck,
  });

  if (next.action === "done") {
    const doneGate = await runDoneGate(doneGateInput, doneGateFn);
    if (doneGate?.isDone) {
      transitions.push("GATE->DONE");
      return {
        state: "DONE",
        iteration,
        reason: "design-gate-behavior-dan-done-gate-lolos",
        verdict: null,
        failCount,
        gate,
        behaviorProbePassed,
        doneGate,
        dom,
        pairwise,
        criticPacket: null,
        criticResult: null,
        patchResult: null,
        criticAgent: CRITIC_AGENT,
        stateDir,
        transitions,
      };
    }
    transitions.push("GATE->HALT");
    return {
      state: "HALT",
      iteration,
      reason: "done-gate-gagal",
      verdict: doneGate?.failureReason ?? "Done-Gate gagal",
      failCount,
      gate,
      behaviorProbePassed,
      doneGate,
      dom,
      pairwise,
      criticPacket: null,
      criticResult: null,
      patchResult: null,
      criticAgent: CRITIC_AGENT,
      stateDir,
      transitions,
    };
  }

  if (next.action === "stop") {
    transitions.push("GATE->HALT");
    return {
      state: "HALT",
      iteration,
      reason: next.reason,
      verdict: next.verdict ?? null,
      failCount,
      gate,
      behaviorProbePassed,
      doneGate: null,
      dom,
      pairwise,
      criticPacket: null,
      criticResult: null,
      patchResult: null,
      criticAgent: CRITIC_AGENT,
      stateDir,
      transitions,
    };
  }

  // CRITIC (kirim paket bersih hasil criticInput(), tanpa kode/klaim Maker)
  transitions.push("GATE->CRITIC");
  const safeBrief = brief && typeof brief === "object" && !Array.isArray(brief)
    ? Object.fromEntries(Object.entries(brief).filter(([k]) => !/^(code|source|claims|prompt)$/i.test(k)))
    : brief;
  const criticPacket = criticBuilder({
    screenshots: gate?.screenshots ?? [],
    gate,
    brief: safeBrief,
    behavior: gate?.behavior ?? null,
    golden,
    design,
  });
  const criticResult = criticRunner
    ? await criticRunner(criticPacket, { agent: CRITIC_AGENT, pairwise, dom, iteration })
    : null;

  let patchResult = null;
  let state = "CRITIC";
  if (patchRunner) {
    transitions.push("CRITIC->PATCH");
    patchResult = await patchRunner({
      target,
      iteration,
      gate,
      criticPacket,
      criticResult,
      pairwise,
    });
    state = "PATCH";
  }

  return {
    state,
    iteration,
    reason: next.reason,
    verdict: null,
    failCount,
    consecutiveFailures: nextConsecutiveFailures,
    gate,
    behaviorProbePassed,
    doneGate: null,
    dom,
    pairwise,
    criticPacket,
    criticResult,
    patchResult,
    criticAgent: CRITIC_AGENT,
    stateDir,
    transitions,
  };
}

/**
 * Jalankan loop penuh DRAFT -> (MEASURE -> GATE -> CRITIC -> PATCH)* -> DONE | HALT.
 */
export async function runDesignLoop(initialCtx = {}, deps = {}) {
  const maxIterations = initialCtx.maxIterations ?? 3;
  let curTarget = initialCtx.target;
  let prevTarget = null;
  let prevFindingsCount = null;
  let consecutiveFailures = 0;
  const allTransitions = [];
  const steps = [];
  let lastStep = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const step = await stepDesignLoop({
      ...initialCtx,
      target: curTarget,
      prevTarget,
      iteration,
      maxIterations,
      consecutiveFailures,
      prevFindingsCount,
      doneGateInput: typeof initialCtx.doneGateInput === "function"
        ? initialCtx.doneGateInput({ iteration, target: curTarget })
        : initialCtx.doneGateInput,
    }, deps);
    steps.push(step);
    allTransitions.push(...step.transitions);
    lastStep = step;
    if (step.state === "DONE" || step.state === "HALT") {
      return {
        state: step.state,
        iteration,
        reason: step.reason,
        verdict: step.verdict,
        steps,
        transitions: allTransitions,
        lastStep,
        criticAgent: CRITIC_AGENT,
      };
    }
    prevTarget = curTarget;
    if (step.patchResult?.target) curTarget = step.patchResult.target;
    prevFindingsCount = step.failCount;
    consecutiveFailures = step.consecutiveFailures;
    if (step.state === "PATCH" && iteration < maxIterations) {
      allTransitions.push("PATCH->MEASURE");
    } else if (step.state === "CRITIC") {
      // Tanpa patchRunner, berhenti di CRITIC agar caller (orchestrator/subagent) melanjutkan PATCH
      return {
        state: "CRITIC",
        iteration,
        reason: step.reason,
        verdict: null,
        steps,
        transitions: allTransitions,
        lastStep,
        criticAgent: CRITIC_AGENT,
      };
    }
  }

  return {
    state: "HALT",
    iteration: maxIterations,
    reason: "n-habis",
    verdict: null,
    steps,
    transitions: allTransitions,
    lastStep,
    criticAgent: CRITIC_AGENT,
  };
}
