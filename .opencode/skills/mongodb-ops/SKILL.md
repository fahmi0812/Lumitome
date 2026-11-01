---
name: mongodb-ops
description: Use when the user designs MongoDB schemas, indexes, aggregation, transactions, or Atlas-compatible data access. Not for UI, not for Supabase Postgres, not for deploying Vercel.
compatibility: opencode
license: MIT
metadata:
  swanwright_original_id: swanwright__mongodb-ops
---

# MongoDB Ops

First-party data modeling and access specialist for MongoDB and Mongoose. Handles document schema design, index strategy, aggregation pipelines, transaction boundaries, and Atlas compatibility.

## Boundaries & Handoffs

| Need | Route |
|---|---|
| Visual UI, forms, dashboard presentation | Frontend UI engineering |
| Supabase Auth, RLS, Postgres migrations | `supabase-ops` |
| Vercel deployment, edge routing, preview URLs | `vercel-ops` |
| Official MongoDB driver / Mongoose syntax | Context7 (`mongodb`, `mongoose`) |
| **MongoDB schema, indexes, aggregations, transactions** | **`mongodb-ops`** |

## Explicit Non-Goals & Safety

- **NO UI generation:** Do not design or style user interfaces, tables, or components. Vendor stack ≠ UI.
- **NO secret exposure:** Never print connection strings containing usernames, passwords, or Atlas cluster credentials. Use environment variable placeholders (`MONGODB_URI`).

## Procedure

1. **Repo Evidence First:**
   - Inspect existing schemas, Mongoose models (`models/`, `schemas/`), or document collections.
   - Check `package.json` or project lockfiles to detect `mongodb` driver version or `mongoose`.
   - Never invent document schemas out of thin air if existing models or types already define the shape.
2. **Official Documentation via Context7:**
   - Fetch verified driver or Mongoose query syntax and index options from Context7. Do not hallucinate deprecated query operators.
3. **Indexing & Aggregation Design:**
   - Define compound indexes following the Equality, Sort, Range (ESR) rule.
   - Profile aggregation pipelines (`$match`, `$project`, `$group`, `$lookup`) to avoid memory spills and unindexed collscans.
4. **Data Access Implementation:**
   - Implement typed models, repository functions, and schema validation scripts according to established project conventions.

## Finish Gate

- State all modified files (e.g. models, schemas, repositories, migration scripts).
- Execute project verification commands (`npm test`, `pytest`) or report `NOT_CONFIGURED` if none exist.
