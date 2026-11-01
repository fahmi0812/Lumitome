---
name: vercel-ops
description: Use when the user configures Vercel deploy, project env (names only), Next.js app router hosting, preview URLs, or vercel.json. Not for inventing visual UI, not for Mongo/Supabase schema.
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__vercel-ops
---

# Vercel Ops

First-party deployment and configuration specialist for Vercel hosting. Handles `vercel.json`, Next.js App Router deployment configuration, edge middleware routing, preview URLs, and environment variable naming.

## Boundaries & Handoffs

| Need | Route |
|---|---|
| Visual UI, frontend styling, component design | Frontend UI engineering |
| Supabase Auth, RLS, Edge Functions, Postgres schema | `supabase-ops` |
| MongoDB schemas, indexing, aggregation | `mongodb-ops` |
| GitHub CI/CD, PR management, Actions workflows | `gh-axi` |
| Official Next.js and Vercel hosting reference | Context7 (`next`, `vercel`) |
| **Vercel deploy configuration, routing, headers, preview URLs** | **`vercel-ops`** |

## Explicit Non-Goals & Safety

- **NO UI generation:** Do not design or style user interfaces, landing pages, or components. Vendor stack ≠ UI.
- **NO secret exposure:** Never print secret tokens, production tokens, or environment variable values. Reference variable names only.
- **NO auto-prod deploys:** Never run `vercel --prod` automatically without explicit user command. Favor preview deployments and GitHub PR checks via `gh-axi`.

## Procedure

1. **Repo Evidence First:**
   - Inspect `vercel.json`, `next.config.*`, `package.json`, and existing build/deploy scripts.
   - Detect framework output directories, runtime version requirements, and route rewrites.
2. **Official Documentation via Context7:**
   - Verify `vercel.json` schema, header definitions, redirects, and edge middleware constraints via Context7.
3. **Deployment & Routing Configuration:**
   - Shape security headers, caching headers, routing rewrites, and function region configs.
   - Integrate with GitHub workflows via `gh-axi` for automated preview comments and deployments.

## Finish Gate

- State all modified files (e.g. `vercel.json`, `next.config.*`, GitHub Actions workflows).
- Execute project build/lint verification (`npm run build`, `npm run lint`) or report `NOT_CONFIGURED` if none exist.
