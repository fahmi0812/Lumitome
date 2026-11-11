---
name: docs-pack
description: 'Bootstrap a 12-file living documentation pack for a project (PRD, architecture, data model, design system, security, testing, code style, API spec, AGENTS.md, changelog, roadmap, decision log). Interview the user one question at a time (max 10), then write the files in the project root.'
license: MIT
metadata:
  swanwright_sector: penulisan
  swanwright_src: fahmi0812/Lumitome
  swanwright_sha: c544afabb5eb88a0e9b5e050353a06bbb0ccc769
  swanwright_original_id: lumitome__docs-pack
  swanwright_original_name: docs-pack
---

# Docs Pack: 12 living docs for a project

Create a complete, self-consistent set of 12 Markdown files in the **user's
project root** (next to `package.json`, never inside Lumitome itself), so any
coding agent — and any human — can pick up the project without guessing.

Provenance: synthesized in Lumitome's own words from "The Claude Code Docs
Pack", a free guide by Sam Butler (@SAMBUTLERAI). The 12-file structure and
the interview workflow are adapted from that guide; the wording, the
templates in `references/templates.md`, and the example content are original.
Do not copy the guide's example app (Shiplog) into a user's project.

## Adaptation: Claude Code → Lumitome / OpenCode

- The guide's `CLAUDE.md` becomes **`AGENTS.md`** here. OpenCode reads
  `AGENTS.md` at the start of every session; it does not read `CLAUDE.md`.
- The guide's `@PRD.md` import lines become plain "Read … before …" pointer
  lines in `AGENTS.md` (OpenCode instruction files, not Claude imports).
  Keep the two always-loaded pointers minimal: PRD and ARCHITECTURE only.
- The guide's `/init` step has no direct equivalent here; the interview in
  this skill replaces it.
- Docs are guidance, not locks. A hard block (never touch `.env`, never
  print a secret) belongs in a hook or a rule, not in these files.

## Workflow

### 1. Interview (max 10 questions, one at a time)

Ask one question, wait for the answer, then ask the next. Never dump all
questions at once, and never invent answers the user did not give. Cover,
in this order, only what is still unknown:

1. What is the product, in one sentence, and who is it for?
2. What are the v1 core features (push back if more than 5)?
3. What is explicitly NOT in v1?
4. What stack (language, framework, database, auth, payments, email, hosting)?
5. What does it look like (colours, fonts, spacing, one reference if any)?
6. How is data shaped (main entities and their relations)?
7. What are the main API endpoints or server actions?
8. What must never happen (secrets, user data, payments — hard rules)?
9. How is it tested, and what does "done" mean for a task?
10. What is the roadmap (Now / Next / Later) and the first version number?

If the project already has code, read it first (10 representative files,
`package.json`, existing migrations and route handlers) and pre-fill what
the code already proves; ask only about the gaps. If the user pastes the
guide's PDF, read it the same way and use its structure, not its example.

### 2. Verify every claim before writing

Before writing each file, check every claim, number, metric, endpoint,
and table in it against its source: the interview answers, the existing
code, or a document the user provided. A number that appears only in a
summary or in a source's metadata — not in the body of the source —
counts as unverified, not as a fact. If a section has no source, write
`[TODO: ask the user]` or mark it "belum terverifikasi" — never invent
it. This is the one verification step borrowed from the
anthropic-verify-first way of working: verify the claim first, and
report what is unverified honestly instead of writing it as fact.

### 3. Write the files, in this order

Write PRD first — every other file must agree with it. Then the three
foundation files, then the four guardrail files, then `AGENTS.md` last
(it points at all the others). Start the three living files with one entry
each. Show each file to the user before saving it.

| # | File | Write when |
|---|---|---|
| 1 | `PRD.md` | First. Product, users, v1 scope, stories, metrics, pricing. |
| 2 | `ARCHITECTURE.md` | Before the first line of code. System diagram, stack, folders, one end-to-end data flow, tidy rules. |
| 3 | `DATA_MODEL.md` | Before the first line of code. Every table/field/relation, naming rules. |
| 4 | `DESIGN_SYSTEM.md` | Before the first line of code. Tokens only, never hard-coded values. |
| 5 | `SECURITY.md` | Before the first real feature. Never/always lists, where keys live, pre-deploy checklist, leak response. |
| 6 | `TESTING.md` | Before the first real feature. Commands, what to test, test data, bug-fix loop, done checklist. |
| 7 | `CODE_STYLE.md` | Before the first real feature. Naming, do/don't, one example, pre-commit checks. |
| 8 | `API_SPEC.md` | Before the first real feature. Endpoint table, one full request/response example, conventions, rate limits. |
| 9 | `AGENTS.md` | Last. Under 200 lines. Pointers to the other 11, commands, rules, done-means checklist. |
| 10 | `CHANGELOG.md` | Start with one entry. Newest first, Added/Changed/Fixed. |
| 11 | `ROADMAP.md` | Start with one entry per section. Now (≤4 items) / Next / Later / Not doing. |
| 12 | `DECISIONS.md` | Start with one entry. Numbered, dated, status, why, trade-off. |

Full per-file templates: read `references/templates.md` before writing.
Keep every file short and specific to this project. Use `[PROJECT]`,
`[STACK]`, `[COMMAND]` placeholders only when the user has not answered
yet — never fill them with the guide's example values.

### 4. Done-means checklist (goes in AGENTS.md)

- Tests, lint, and typecheck pass (see `TESTING.md`).
- UI uses design tokens only (see `DESIGN_SYSTEM.md`).
- One line added to `CHANGELOG.md` before every commit.
- No file over its scope: only build what is under Now in `ROADMAP.md`.

## Living-docs rules

Docs that go out of date are worse than no docs, because the agent follows
them anyway. Enforce these on every later task in the project:

- **Every commit:** add one line to `CHANGELOG.md` first.
- **Tool or pattern swap:** add an entry to `DECISIONS.md`; never delete
  an old entry — mark it Replaced by the new one.
- **Roadmap item finished:** tick it in `ROADMAP.md` and log it in
  `CHANGELOG.md`.
- **Plan changes:** change `PRD.md` first, then the code.
- **New service, folder, or data flow:** update `ARCHITECTURE.md` in the
  same change. New migration: update `DATA_MODEL.md` in the same commit.
- **New colour, size, or component:** add the token to `DESIGN_SYSTEM.md`
  first, then use it. New test command or e2e journey: update `TESTING.md`.
- **Monthly audit:** compare every `.md` doc in the project with the actual
  code. List anything out of date or wrong, with file and line. Wait for
  the user's approval, then **fix the docs, not the code**.

## Delegate — do not re-teach

This skill owns only the 12-file set, the interview, and the living-docs
rules. For the content inside each file, delegate to the Lumitome skill
that already knows it:

| File / topic | Delegate to |
|---|---|
| `DESIGN_SYSTEM.md` tokens, components | `design-system` (tokens, component specs); `stitch-ui` if the look comes from a reference image |
| `SECURITY.md` rules, key handling | `security-audit`; Lumitome rule `01-safety.md` for the agent itself |
| `TESTING.md` test design, bug-fix loop | `tdd-red-green-refactor` |
| `DATA_MODEL.md` / `API_SPEC.md` shape | `typed-service-contracts`; diagrams via `diagram-design` |
| `ARCHITECTURE.md` structure | `improve-codebase-architecture` when refactoring an existing codebase |
| Verifying a claim, number, or metric | anthropic-verify-first way of working: verify against the source, mark what is unverified — a method reference, not an imported skill |
| Writing the docs themselves | `doc-coauthoring`, `technical-writer` |
| Drift between docs and code | `.opencode/rules/00-doc-code-drift.md` |

## Cross-reference

- `docs-pack`'s `PRD.md` and `DESIGN_SYSTEM.md` are the inputs to
  `stitch-ui` (UI work starts from a finished PRD and design tokens).
- `stitch-ui`'s `design.md` output feeds back into this skill's
  `DESIGN_SYSTEM.md` (tokens extracted from a reference image).

## Guardrails

- Never write secrets, API keys, tokens, or a real local LLM endpoint
  address into any of the 12 files. Key names only (e.g. `[SERVICE]_API_KEY`),
  values live in `.env` (git-ignored) or the deployment environment.
- Never invent features, endpoints, tables, or metrics the user did not
  confirm. If a section is unknown, write `[TODO: ask the user]` and say so.
  Check every number against the body of its source — a figure that
  appears only in a summary or metadata is unverified, not a fact.
- If the user asks for a single doc instead of the pack, write only that
  file from its template and skip the interview questions that do not apply.
