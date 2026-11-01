/**
 * Post-push FACT file. The plugin reads it. It does not call gh or a model.
 * Omission is not NOT_CONFIGURED.
 */

import * as fs from "fs";
import { evaluateDoneGate } from "./done-gate.ts";
import type { CiStatus } from "./io-schema/types.ts";

export const POST_PUSH_FACT_RELATIVE = "runtime/post-push-fact.json";
export const POST_PUSH_REMINDER = "post-push verification pending";

export interface PostPushFact {
  remoteShaOk?: boolean;
  localSha?: string;
  remoteSha?: string;
  ciStatus?: CiStatus;
  facts?: string[];
}

export function isGitPushCommand(command: string): boolean {
  return /\bgit\s+push\b/.test(command);
}

export function readPostPushFact(filePath: string): PostPushFact | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as PostPushFact;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function postPushFactSatisfied(fact: PostPushFact | null): boolean {
  if (!fact) return false;
  return evaluateDoneGate({
    commandExitCode: 0,
    expectedArtifacts: [],
    testsGreen: true,
    pushRequested: true,
    remoteShaOk: fact.remoteShaOk,
    ciStatus: fact.ciStatus,
    facts: fact.facts,
  }).isDone;
}
