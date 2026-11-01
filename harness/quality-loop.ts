/**
 * Quality loop wiring. Done-gate first, then root-cause-gate, then anti-spin.
 * root-cause-gate stays a protocol (not an intent-registry skill).
 */

import { AntiSpinTracker } from "./anti-spin.ts";
import { evaluateDoneGate } from "./done-gate.ts";
import type { DoneGateInput } from "./io-schema/types.ts";
import { evaluateRootCauseGate, type RootCauseGateInput } from "./root-cause-gate.ts";

export interface QualityLoopInput {
  taskId: string;
  done: DoneGateInput;
  rootCause?: RootCauseGateInput;
  tracker?: AntiSpinTracker;
}

/** Agent order after a local change. The loop itself does not shell out. */
export const QUALITY_LOOP_ORDER = [
  "local-tests",
  "scanner-if-release",
  "commit",
  "push",
  "verify-remote-sha",
  "verify-ci",
  "fact-ledger",
  "done",
] as const;

export function runQualityLoop(input: QualityLoopInput) {
  const tracker = input.tracker ?? new AntiSpinTracker(input.taskId);
  const done = evaluateDoneGate(input.done);
  const rootCause = done.isDone && input.rootCause ? evaluateRootCauseGate(input.rootCause) : null;
  const spin = tracker.recordIteration(done);
  return { done, rootCause, spin };
}
