---
name: google-ads-audit
description: Google Ads account audit and business context setup. Use for account-health audits and business-context setup. Trigger on "audit my ads", "ads audit", "set up my ads", "onboard", "account overview", "how's my account", "ads health check", "what should I fix in my ads", or when the user is new to NotFair and hasn't run an audit before.
license: MIT
argument-hint: <account name or 'audit my ads'>
metadata:
  swanwright_sector: penulisan
  swanwright_src: nowork-studio/notfair-plugin
  swanwright_sha: f70e36082a50db00c18a7752ba97ffa1052d3472
  swanwright_original_id: nowork-studio-notfair-plugin__google-ads-audit
  swanwright_original_name: google-ads-audit
---


# Canonical NotFair workflow

Read [`./WORKFLOW.md`](./WORKFLOW.md) completely, then follow it as the active workflow. Normalize that path from the directory containing this wrapper: the canonical file is `<plugin-root>/google-ads/audit/WORKFLOW.md`, not `<plugin-root>/skills/google-ads-audit/audit/SKILL.md`. Resolve every relative reference from the canonical file against `<plugin-root>/google-ads/audit/`. If the canonical file cannot be read, stop and report the packaging error; never substitute a similarly named skill from another plugin.
