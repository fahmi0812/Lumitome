---
name: anti-spin-circuit-breaker
description: Enforce hardcoded iteration limits (max 3) to break repetitive runaway cycles and trigger Exception Auditor.
metadata:
  swanwright_original_id: swanwright__anti-spin
  swanwright_original_name: Anti-Spin Circuit Breaker
---

# Anti-Spin Circuit Breaker Protocol

## Operational Rules

1. **Hardcoded Maximum Iterations:**
   - The loop counter is hardcoded to `max_iterations = 3`.
   - It is strictly non-negotiable and cannot be bypassed by model prompting.

2. **Iteration Tracking:**
   - Iteration 1: Normal execution and Done-Gate validation.
   - Iteration 2 (if Iteration 1 failed): Re-plan with error feedback.
   - Iteration 3 (if Iteration 2 failed): Final attempt with targeted diagnostics. If this fails, the circuit breaker TRIPS immediately.

3. **Exception Auditor Trigger:**
   - If two consecutive failures occur, trigger the `iFixAi` Exception Auditor (`/audit`) for deep root-cause failure analysis.

4. **Circuit Breaker Tripped Behavior:**
   - When tripped, cease all tool calls and automated attempts.
   - Output an unvarnished diagnosis detailing:
     - The exact failures across all 3 iterations.
     - Why the Done-Gate could not be satisfied.
     - Specific recommendations for manual operator intervention.
