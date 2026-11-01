---
name: root-cause-gate
description: Analyze whether a proposed fix addresses root causes or symptoms, scan for cross-module patterns, and halt before expanding blast radius.
metadata:
  swanwright_original_id: swanwright__root-cause-gate
  swanwright_original_name: Root Cause Gate
---

# Root-Cause Gate (RCG), Scope Guard (SCG), & Consent Checkpoint (CCP)

## Execution Protocol

Whenever a bug fix or code change passes test execution:

1. **Symptom vs Root Cause Audit:**
   - Ask: Did this change resolve the fundamental root cause, or did it merely suppress an error symptom?
   - If symptom only: Document the true underlying defect and formulate a planned solution.

2. **Cross-Module Pattern Scan:**
   - Perform a grep / code search across sibling packages and modules for identical defect patterns.
   - Example: If a missing null check or unhandled promise rejection occurred in module A, search modules B, C, and D for the same pattern.

3. **Scope Guard & Consent Checkpoint (Stop-and-Ask):**
   - Default behavior is **minimal patch**.
   - If addressing the root cause requires refactoring across multiple module boundaries (high blast radius):
     - **DO NOT** expand changes automatically.
     - **STOP & ASK** the operator for explicit consent before modifying files outside the immediate target module.
