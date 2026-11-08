---
name: setup-cms
argument-hint: '<CMS name: wordpress, strapi, contentful, or ghost>'
description: Connect a CMS to notfair SEO tools. Guides users through configuring WordPress, Strapi, Contentful, or Ghost — tests the connection, and writes credentials to .env.local. Once set up, seo-analysis automatically cross- references CMS content against Google Search Console data. Use whenever the user says "connect my CMS", "set up WordPress", "configure Strapi", "add Contentful", "connect Ghost", or "CMS setup". Also trigger if the user asks why no CMS data appears in a seo-analysis report.
license: MIT
metadata:
  swanwright_sector: penulisan
  swanwright_src: nowork-studio/notfair-plugin
  swanwright_sha: f70e36082a50db00c18a7752ba97ffa1052d3472
  swanwright_original_id: nowork-studio-notfair-plugin__setup-cms
  swanwright_original_name: setup-cms
---


# Canonical NotFair workflow

Read [`./WORKFLOW.md`](./WORKFLOW.md) completely, then follow it as the active workflow. Resolve every relative reference from that file against `./`.
