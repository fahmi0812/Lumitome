---
name: unified-done-gate
description: Enforce deterministic completion checks before marking any task as complete. A missing gate is UNRUN, not PASS.
metadata:
  swanwright_original_id: swanwright__unified-done-gate
  swanwright_original_name: Unified Done-Gate
---

# Unified Done-Gate Protocol

This skill replaces subjective LLM self-evaluation with concrete, verifiable gate checks. Read `.opencode/rules/01-verification.md` and `.opencode/rules/decision-log-protocol.md`.

## Base checks

A task is not done unless all three hold:

1. `exit_code === 0`
2. Required artifacts exist and are non-empty
3. Relevant tests passed

## Profile and push checks

4. If `pushRequested`, `remoteShaOk` is true and a `FACT:` row names the remote SHA. `ciStatus` is `GREEN` with a CI FACT, or `NOT_CONFIGURED` with an explicit FACT. Omission is `UNRUN` and fails.
5. If the profile is `RELEASE`, the scanner gate is `PASS`. A missing or `NOT_CONFIGURED` scanner fails. Other release gates are `PASS` or an explicit `FACT: ... NOT_CONFIGURED`.

`JUDGMENT:` never overrides a failed or missing FACT.

## Order

`local tests → scanner if RELEASE → commit → push → verify remote SHA → verify CI → FACT ledger → DONE`

If a check fails, do not claim success. Re-plan or hand off to anti-spin. Maximum 3 iterations. Do not weaken tests to manufacture PASS.
