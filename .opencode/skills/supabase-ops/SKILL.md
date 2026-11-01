---
name: supabase-ops
description: Use when the user works on Supabase Auth, RLS, Postgres schema/migrations, Edge Functions, Storage, Realtime, supabase-js, or @supabase/ssr. Not for visual UI, not for MongoDB, not for Vercel deploy-only.
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__supabase-ops
---

# Supabase Ops

First-party operational and contract specialist for Supabase. Handles database schemas, migrations, Row Level Security (RLS) policies, Auth contracts, Edge Functions, Storage, Realtime, and client SDK integration (`@supabase/supabase-js`, `@supabase/ssr`).

## Boundaries & Handoffs

| Need | Route |
|---|---|
| Visual UI, login forms, frontend presentation | Frontend UI engineering |
| Defensive audit of Auth / RLS policies / public table exposure | `full-audit-keamanan` (risk XOR, do not load concurrently) |
| MongoDB schemas, indexing, aggregation | `mongodb-ops` |
| Vercel deployment and hosting configuration | `vercel-ops` |
| Official Supabase API and library syntax | Context7 (`@supabase/supabase-js`, `@supabase/ssr`) |
| **Supabase schema, migrations, RLS, Auth contracts, Edge Functions** | **`supabase-ops`** |

## Explicit Non-Goals & Safety

- **NO UI generation:** Do not generate or style user interfaces, login forms, or dashboards. Vendor stack ≠ UI.
- **NO secret exposure:** Never print `service_role` keys, database connection strings containing passwords, or JWTs. Reference secret names only (e.g. in `.env.example`).

## Procedure

1. **Repo Evidence First:**
   - Inspect existing SQL schemas, `supabase/migrations/`, `supabase/config.toml`, and `.env.example` (without secrets).
   - Check `package.json` for installed Supabase packages (`@supabase/supabase-js`, `@supabase/ssr`).
   - Never invent database tables or schemas out of thin air when migration files or existing models exist.
2. **Official Documentation via Context7:**
   - Fetch verified API contracts from Context7 for `@supabase/supabase-js` or `@supabase/ssr`. Do not guess API methods.
3. **RLS & Security Enforcement:**
   - Ensure Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) is enabled on all tables exposed to the client.
   - Specify explicit policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`. For sensitive public APIs or security audits, recommend `full-audit-keamanan` as risk specialist.
4. **Auth & Backend Contracts:**
   - Configure SSR cookie exchange patterns and server client wrappers.
   - Login and onboarding UI pages remain separate frontend presentation; this skill delivers backend route handlers, server actions, and schema policies.

## Finish Gate

- State all modified files (e.g. migrations, client factories, route handlers).
- Execute project verification commands (`npm test`, `pytest`) or report `NOT_CONFIGURED` if none exist.
