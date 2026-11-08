---
name: wordpress
description: Operate connected WordPress sites through the NotFair MCP. Use for WordPress content, posts, pages, media, comments, terms, design, settings, plugins, themes, HTML files, or approved WordPress changes on a NotFair-connected site. Not the local Application-Password CMS setup used by SEO scripts.
license: MIT
argument-hint: <site, content, plugin, or WordPress change>
metadata:
  swanwright_sector: penulisan
  swanwright_src: nowork-studio/notfair-plugin
  swanwright_sha: f70e36082a50db00c18a7752ba97ffa1052d3472
  swanwright_original_id: nowork-studio-notfair-plugin__wordpress
  swanwright_original_name: wordpress
---


# Canonical NotFair workflow

Read [`./WORKFLOW.md`](./WORKFLOW.md) completely, then follow it as the active workflow. Normalize that path from the directory containing this wrapper: the canonical file is `<plugin-root>/wordpress/WORKFLOW.md`, not `<plugin-root>/skills/wordpress/wordpress/WORKFLOW.md`. Resolve every relative reference from the canonical file against `<plugin-root>/wordpress/`. If the canonical file cannot be read, stop and report the packaging error; never substitute a similarly named skill from another plugin.
