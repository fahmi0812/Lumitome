---
name: anti-spin-circuit-breaker
description: Enforce hardcoded iteration limits (max 3) to break repetitive runaway cycles and trigger Exception Auditor.
metadata:
  swanwright_original_id: swanwright__anti-spin
  swanwright_original_name: Anti-Spin Circuit Breaker
---

# Anti-Spin Circuit Breaker Protocol

## Operational Rules

1. **Canonical Rule (Single Definition):**
   - **3 consecutive failures for the SAME hypothesis/approach → stop & report; substantively changing hypothesis resets the counter.**
   - (`max_iterations = 3` per hypothesis, hardcoded and non-negotiable — cannot be bypassed by model prompting.)

2. **Iteration Tracking:**
   - Failure 1: Re-check diagnostics and adjust or pivot.
   - Failure 2 (same hypothesis): Trigger root-cause re-evaluation / Exception Auditor (`/audit`) before a 3rd attempt.
   - Failure 3 (same hypothesis): Circuit breaker TRIPS immediately.
   - Substantive hypothesis change (replacing the underlying root-cause premise/approach rather than repeating tweaks): Resets the consecutive failure counter to `0`.

3. **Exception Auditor Trigger:**
   - If two consecutive failures occur on the same hypothesis, trigger the `iFixAi` Exception Auditor (`/audit`) for deep root-cause failure analysis.

4. **Circuit Breaker Tripped Behavior:**
   - When tripped, cease all tool calls and automated attempts on that hypothesis.
   - Output an unvarnished diagnosis detailing:
     - The exact failures across all 3 consecutive attempts and the attacked premise.
     - Why the Done-Gate could not be satisfied.
     - Specific recommendations for manual operator intervention.
