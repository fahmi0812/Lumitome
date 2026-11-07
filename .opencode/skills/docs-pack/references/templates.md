# Docs Pack — 12 templates (synthesized, generic)

Paraphrased structure adapted from "The Claude Code Docs Pack" by Sam Butler
(@SAMBUTLERAI). All content below is original wording with generic
placeholders — fill every `[BRACKET]` from the interview answers or the
existing codebase. Never copy the guide's example app into a project.

## 1. PRD.md — Product Requirements: [PROJECT]

1. Overview — what it is, in one paragraph.
2. Problem — the pain, in the user's words.
3. Goal — one measurable outcome (e.g. "[X] in the first [N] months").
4. Target users — 2–4 named groups.
5. Core features (v1) — at most 5, each one line. Not in v1 — explicit list.
6. User stories — "As a [role], I can [action] in [time/steps]."
7. Success metrics — 2–3 numbers with a time frame.
8. Pricing — tiers and what each includes, or "not decided yet".

## 2. ARCHITECTURE.md — Architecture: [PROJECT]

- System overview — one plain-text flow: `[CLIENT] -> [APP] -> [DATABASE] -> [SERVICES]`.
- Tech stack — frontend, backend, database/auth, payments, email, hosting.
- Folders — one line per folder: what lives there and nowhere else.
- Data flow — numbered steps for the main feature, end to end.
- Rules — e.g. "Database calls only in `[DB_DIR]/`. No secrets in client
  components. New service or folder? Update this file in the same change."

## 3. DATA_MODEL.md — Data Model: [PROJECT]

- One section per table: fields with types, primary/foreign keys, defaults.
- Rule line at the top: "Never add a column that isn't listed here. Propose
  it first."
- Rules — migrations only (never by hand); access control on every table;
  naming: plural snake_case tables, `<table>_id` foreign keys, `*_at`
  timestamps.

## 4. DESIGN_SYSTEM.md — Design System: [PROJECT]

- Colours — token table: name, value, use. Tokens only; never hard-code a value.
- Typography — font, display/heading/body/small sizes and weights, line height.
- Spacing — scale (e.g. 4, 8, 16, 24, 32, 64) and section gaps.
- Components — button variants, input, badge, empty state; each with hover,
  focus, disabled, and loading states.
- Rules — where tokens live; icon set and size; dark mode uses the same
  token names with dark values.
- Voice — short, plain, friendly; buttons say what they do.

## 5. SECURITY.md — Security Rules: [PROJECT]

- Never — commit `.env` or keys; log passwords, tokens, or payment details;
  disable access control to fix a bug; trust browser input; use a server
  key in client code.
- Always — validate every input on the server; check the session in every
  handler; verify webhook signatures; rate-limit public endpoints.
- Where keys live — table: public (safe in client) vs server-only; locally
  in `.env.local` (git-ignored); live in the hosting environment.
- Before every deploy — checklist: access control on for every table; no
  server keys in the client bundle; every page tested while logged out;
  dependency audit shows no high/critical issues.
- If a key leaks — 1. Rotate it in the provider dashboard, then update the
  environment. 2. Check provider logs for use since the leak. 3. Write what
  happened in `CHANGELOG.md`.

## 6. TESTING.md — Testing Guide: [PROJECT]

- Commands — unit tests, e2e tests, typecheck, lint (exact commands).
- What to test — unit: every function in `[CORE_DIR]/`, limits/pricing logic,
  date helpers, webhook handlers with sample payloads. E2E: the 4 user
  journeys that matter most (sign up, main action, second action, checkout).
- Test data — seed script, test mode for payments, where test emails go.
- Fixing a bug — 1. Write a failing test. 2. Fix the code. 3. Run the full
  suite. 4. Note the fix in `CHANGELOG.md`.
- Done checklist — all tests pass; new code has a test; no skipped or
  `.only` tests; typecheck and lint clean.

## 7. CODE_STYLE.md — Code Style: [PROJECT]

- Naming table — components PascalCase, functions camelCase, files
  kebab-case, constants UPPER_SNAKE, database snake_case (adapt to the stack).
- Do — one job per function (over ~40 lines, split it); return early; type
  every prop and return value; comments explain why, not what.
- Don't — `any` (or the stack's equivalent escape hatch); unused imports or
  debug prints; files over ~300 lines; duplicated code; a new dependency
  without asking first.
- Example — one short before/after snippet in the project's language.
- Before you commit — lint and typecheck commands.

## 8. API_SPEC.md — API Spec: [PROJECT]

- Endpoints table — method, path, auth, what it does.
- Example — one full request and response for the most-used endpoint,
  including one error response.
- Conventions — errors always look like `{error, code}`; lists paginate
  with a cursor; dates are ISO 8601 in UTC; owner routes use the session.
- Rate limits — table by caller type (public / logged in / webhooks).
- Changing the API — update this file first, then the code, then the tests.

## 9. AGENTS.md — [PROJECT]: Project Instructions

Under 200 lines. One line: what the project is + stack. Then:

```markdown
# [PROJECT]: Project Instructions

[PROJECT] — [one sentence]. Stack: [STACK].

## Always read first
- PRD.md
- ARCHITECTURE.md

## Read before you…
- touch any UI: DESIGN_SYSTEM.md
- touch auth, keys, or user data: SECURITY.md
- write or change code: CODE_STYLE.md
- change the database: DATA_MODEL.md
- add or change an endpoint: API_SPEC.md
- start a feature: ROADMAP.md (only build what's under Now)
- swap a tool or pattern: DECISIONS.md

## Commands
- [DEV_COMMAND] — local server
- [TEST_COMMAND] — unit tests
- [E2E_COMMAND] — browser tests
- [TYPECHECK_COMMAND] — typecheck
- [LINT_COMMAND] — lint

## Rules
- Plan the change in 3 steps or fewer. Show me before coding.
- Ask if anything is unclear. Don't guess.
- [STACK-SPECIFIC RULES, e.g. strict types, database calls only in lib/db/]
- Never edit .env files or print secrets.

## Done means
- [ ] Tests, lint, and typecheck pass (see TESTING.md)
- [ ] UI uses design tokens only
- [ ] One line added to CHANGELOG.md
```

## 10. CHANGELOG.md — Changelog: [PROJECT]

Newest first, Keep-a-Changelog style. The agent reads the latest entry at
the start of a session and adds a line before every commit.

```markdown
# Changelog: [PROJECT]

## [0.1.0] — [DATE]
### Added
- [First feature]
### Changed
- [What changed]
### Fixed
- [What was fixed]

## How to log a change
- Add the entry before you commit.
- Group lines under Added, Changed, or Fixed.
- One line per change, written for a human.
```

## 11. ROADMAP.md — Roadmap: [PROJECT]

```markdown
# Roadmap: [PROJECT]
Last updated: [DATE]

Only build what's under Now. For anything else, ask first.

## Now ([MONTH])
- [ ] [Item 1]
- [ ] [Item 2]

## Next ([MONTH])
- [ ] [Item]

## Later
- [Item]

## Not doing
- [Item]

## The rule
Finished an item? Tick it here and log it in CHANGELOG.md.
```

Keep Now to 4 items or fewer.

## 12. DECISIONS.md — Decision Log: [PROJECT]

```markdown
# Decision Log: [PROJECT]
Why each choice was made. Don't undo these. To change one, add a new
entry that replaces it. Never delete an old one.

## 001 · [Choice] over [Alternative] · [DATE] · Accepted
Why: [reason].
Trade-off: [cost].

## Template for a new decision
## 00N · [Title] · [DATE]
Status: Proposed / Accepted / Replaced by 00N
Why:
Trade-off:
```
