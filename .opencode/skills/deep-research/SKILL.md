---
name: deep-research
description: Synthesizes a question across sources, separating claims, evidence, and gaps.
metadata:
  swanwright_original_id: swanwright__deep-research
  swanwright_original_name: Deep Research
---

# Deep Research

Source: https://github.com/davila7/claude-code-templates
Pin: e7d17f93bb90d4f351733f06716fe92fdb25de28
Commit-Date: 2026-10-21
License: MIT (davila7/claude-code-templates). Local summary, not a vendored copy.

## Method

1. Restate the question in one sentence.
2. Collect sources before writing the answer. Prefer primary papers over commentary.
3. For each claim, keep the source and the date.
4. Mark what was not found. Do not fill gaps with invention.
5. Academic lookup uses the configured research tools. This skill does not add a new search router.
