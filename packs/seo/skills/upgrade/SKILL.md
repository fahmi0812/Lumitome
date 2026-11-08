---
name: upgrade
argument-hint: <or just run '/notfair:upgrade'>
description: Upgrade the NotFair plugin to the latest version. Updates the marketplace repo, installs the new version to the plugin cache, and updates installed_plugins.json. Use when asked to "upgrade notfair", "update notfair", or "get latest version". Also handles inline upgrade prompts when a skill detects UPGRADE_AVAILABLE at startup.
license: MIT
metadata:
  swanwright_sector: penulisan
  swanwright_src: nowork-studio/notfair-plugin
  swanwright_sha: f70e36082a50db00c18a7752ba97ffa1052d3472
  swanwright_original_id: nowork-studio-notfair-plugin__upgrade
  swanwright_original_name: upgrade
---


# Canonical NotFair workflow

Read [`./WORKFLOW.md`](./WORKFLOW.md) completely, then follow it as the active workflow. Resolve every relative reference from that file against `./`.
