/**
 * Swanwright - Anti-Spin Circuit Breaker
 * Hardcoded loop limiter (max_iterations = 3) to prevent runaway execution (PRD §5.1).
 */

import type { AntiSpinState, DoneGateResult } from "./io-schema/types.ts";

export class AntiSpinTracker {
  private state: AntiSpinState;

  constructor(taskId: string) {
    this.state = {
      taskId,
      currentIteration: 0,
      maxIterations: 3, // Hardcoded per PRD §5.1, non-configurable
      consecutiveFailures: 0,
      circuitBreakerTripped: false,
      history: [],
    };
  }

  public getState(): Readonly<AntiSpinState> {
    return { ...this.state };
  }

  /**
   * Records the outcome of a Done-Gate evaluation for the current iteration.
   * Returns whether execution is permitted to continue.
   */
  public recordIteration(result: DoneGateResult): {
    canContinue: boolean;
    tripped: boolean;
    consecutiveFailures: number;
    invokeExceptionAuditor: boolean;
    message: string;
  } {
    this.state.currentIteration += 1;
    this.state.history.push({
      iteration: this.state.currentIteration,
      timestamp: Date.now(),
      doneResult: result,
    });

    if (result.isDone) {
      this.state.consecutiveFailures = 0;
      return {
        canContinue: false, // Task completed successfully!
        tripped: false,
        consecutiveFailures: 0,
        invokeExceptionAuditor: false,
        message: `Task completed successfully on iteration ${this.state.currentIteration}.`,
      };
    }

    this.state.consecutiveFailures += 1;

    // Check if Exception Auditor (iFixAi) should be invoked (2 consecutive failures)
    const invokeExceptionAuditor = this.state.consecutiveFailures >= 2;

    // Check if Circuit Breaker tripped (reached hardcoded limit of 3)
    if (this.state.currentIteration >= this.state.maxIterations) {
      this.state.circuitBreakerTripped = true;
      return {
        canContinue: false,
        tripped: true,
        consecutiveFailures: this.state.consecutiveFailures,
        invokeExceptionAuditor,
        message: `CIRCUIT BREAKER TRIPPED: Reached hardcoded maximum of ${this.state.maxIterations} iterations without satisfying Done-Gate. Halting for operator intervention.`,
      };
    }

    return {
      canContinue: true,
      tripped: false,
      consecutiveFailures: this.state.consecutiveFailures,
      invokeExceptionAuditor,
      message: `Iteration ${this.state.currentIteration} failed Done-Gate (${result.failureReason}). Re-planning iteration ${this.state.currentIteration + 1}/${this.state.maxIterations}.`,
    };
  }
}
