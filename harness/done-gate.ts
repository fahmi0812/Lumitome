/**
 * Swanwright - Unified Done-Gate
 * Deterministic quality gate. A missing check is UNRUN, not PASS.
 * NOT_CONFIGURED counts only when an explicit FACT row records it.
 * JUDGMENT rows never override a failed or missing FACT.
 */

import * as fs from "fs";
import { checkDiffScope } from "./scan-gate.ts";
import { checkRewriteToDocs } from "./doc-drift.ts";
import type { CiStatus, DoneGateInput, DoneGateResult, GateStatus } from "./io-schema/types.ts";

const RELEASE_ACCOUNTED = ["typecheck", "tests", "build"] as const;

export function factMatches(facts: string[] | undefined, pattern: RegExp): boolean {
  return (facts ?? []).some((line) => {
    const trimmed = line.trim();
    return /^FACT:/i.test(trimmed) && pattern.test(trimmed);
  });
}

function releaseGateStatus(input: DoneGateInput, name: string): GateStatus {
  return input.releaseGates?.[name] ?? "UNRUN";
}

function pushBlocks(input: DoneGateInput): string[] {
  if (!input.pushRequested) return [];
  const reasons: string[] = [];
  const remoteFact = factMatches(input.facts, /remote/i);
  if (input.remoteShaOk !== true || !remoteFact) {
    reasons.push("push requested without a remote SHA FACT");
  }
  if (input.ciStatus === "GREEN") {
    if (!factMatches(input.facts, /\bci\b/i)) {
      reasons.push("CI green is not recorded as a FACT");
    }
  } else if (input.ciStatus === "NOT_CONFIGURED") {
    if (!factMatches(input.facts, /NOT_CONFIGURED/)) {
      reasons.push("ciStatus NOT_CONFIGURED is not an explicit FACT");
    }
  } else {
    reasons.push(`ciStatus is ${input.ciStatus ?? "UNRUN"} (expected GREEN or explicit NOT_CONFIGURED)`);
  }
  return reasons;
}

function releaseBlocks(input: DoneGateInput): string[] {
  if (input.verificationProfile !== "RELEASE") return [];
  const reasons: string[] = [];
  const fromGate = input.scanGate ? (input.scanGate.status === "WARN" ? "PASS" : input.scanGate.status) : undefined;
  const scanner = input.releaseGates?.scanner ?? input.scannerStatus ?? fromGate ?? "UNRUN";
  if (scanner !== "PASS") {
    reasons.push(`RELEASE scanner is ${scanner}`);
  }
  for (const name of RELEASE_ACCOUNTED) {
    const status = releaseGateStatus(input, name);
    if (status === "PASS") continue;
    if (
      status === "NOT_CONFIGURED" &&
      factMatches(input.facts, new RegExp(`NOT_CONFIGURED.*${name}|${name}.*NOT_CONFIGURED`, "i"))
    ) {
      continue;
    }
    reasons.push(`RELEASE gate ${name} is ${status}`);
  }
  return reasons;
}

function scanBlocks(input: DoneGateInput): string[] {
  const required = input.sector === "coding" || input.scanGate !== undefined;
  if (!required) return [];
  const st = input.scanGate?.status ?? "UNRUN";
  if (st === "PASS" || st === "WARN") return [];
  if (st === "UNRUN" && factMatches(input.facts, /NOT_CONFIGURED.*scan|scan.*NOT_CONFIGURED/i)) return [];
  const detail = input.scanGate?.blocks?.length ? `: ${input.scanGate.blocks.join(" | ")}` : "";
  return [`scan-gate ${st} (UNRUN bukan PASS)${detail}`];
}

export function evaluateDoneGate(input: DoneGateInput): DoneGateResult {
  const exitCodeOk = input.commandExitCode === 0;

  const missingArtifacts: string[] = [];
  for (const artifact of input.expectedArtifacts) {
    if (input.actualArtifactsCheck) {
      if (!input.actualArtifactsCheck(artifact)) {
        missingArtifacts.push(artifact);
      }
    } else {
      try {
        if (!fs.existsSync(artifact)) {
          missingArtifacts.push(artifact);
        } else {
          const stat = fs.statSync(artifact);
          if (stat.size === 0) {
            missingArtifacts.push(`${artifact} (empty file)`);
          }
        }
      } catch {
        missingArtifacts.push(artifact);
      }
    }
  }

  const artifactsExist = missingArtifacts.length === 0;

  let testsPassed = true;
  if (input.testCommandExitCode !== undefined && input.testCommandExitCode !== null) {
    testsPassed = input.testCommandExitCode === 0;
  } else if (input.testsGreen !== undefined) {
    testsPassed = input.testsGreen;
  }

  const extra = [...pushBlocks(input), ...releaseBlocks(input), ...scanBlocks(input)];
  const warnings = [
    ...(input.scanGate?.warnings ?? []),
    ...checkDiffScope(input.changedFiles ?? [], input.taskScope ?? []),
    ...checkRewriteToDocs({ changedFiles: input.changedFiles ?? [], passingBefore: input.passingBefore ?? [], reasons: input.changeReasons }),
  ];
  const isDone = exitCodeOk && artifactsExist && testsPassed && extra.length === 0;

  let failureReason: string | undefined;
  if (!isDone) {
    const reasons: string[] = [];
    if (!exitCodeOk) reasons.push(`Command exit code was ${input.commandExitCode} (expected 0)`);
    if (!artifactsExist) reasons.push(`Missing or empty target artifacts: [${missingArtifacts.join(", ")}]`);
    if (!testsPassed) reasons.push("Test suite did not pass (testsGreen is false)");
    reasons.push(...extra);
    failureReason = reasons.join("; ");
  }

  return {
    isDone,
    exitCodeOk,
    artifactsExist,
    missingArtifacts,
    testsPassed,
    remoteShaOk: input.remoteShaOk,
    ciStatus: input.ciStatus as CiStatus | undefined,
    verificationProfile: input.verificationProfile,
    failureReason,
    warnings,
    docCodeDrift: (input.docCodeDrift ?? []).filter((l) => /^FACT:/i.test(l.trim())),
  };
}
