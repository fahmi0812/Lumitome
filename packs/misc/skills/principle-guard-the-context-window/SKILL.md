---
name: principle-guard-the-context-window
description: 'Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads.'
disable-model-invocation: true
metadata:
  swanwright_src: cursor/plugins
  swanwright_sha: 236e5481d05cbadc315b374a5de54971858c27bb
  swanwright_original_id: cursor-plugins__principle-guard-the-context-window
---

# Guard the Context Window

**Why:** Context overflow degrades reasoning quality, creates compression artifacts, and halts progress.

**Pattern:**
- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.
