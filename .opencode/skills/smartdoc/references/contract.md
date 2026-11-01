# Document Contract

The model proposes roles, intent, and goal. `lib/smartdoc/contract.py` validates, normalizes, and locks. Do not invent a second schema.

## Roles

| Role | Meaning |
|---|---|
| instruction | tasks, questions, rubric, brief |
| source | allowed knowledge |
| draft | existing work to change |
| template | mandatory layout |
| style_reference | look/prose example; not facts |
| data | structured facts |
| audit_report | similarity/review/grade report |
| output_reference | example of the finished artifact |

## Intent

`ANSWER` `CREATE` `TRANSFORM` `SUMMARIZE_STUDY` `EXTRACT` `ANALYZE` `SYNTHESIZE` `VERIFY`

Fidelity: `STRICT` (extraction, forms, formulae) · `BALANCED` (default) · `ADAPTIVE` (creative prose).

## Confidence

Deterministic, from filled fields:

- LOW — no goal description. Ask the goal.
- HIGH — goal + output format + language. Do not ask redundant questions.
- MEDIUM — otherwise. Ask only the next HIGH/CRITICAL missing decision.

Never ask identity unless the artifact needs it and no selected profile exists (`node harness/smartdoc/cli.mjs smartdoc profile list`).

## Source policy

Default: attached only, web false. Do not expand authority silently.

Originality default `OFF`. If enabled, name the corpus (attached, selected SmartBooks, authorized web hits). Label: **Local Similarity Audit**.

## Locks

`GOAL_LOCK` freezes intent, goal, audience, language, source_policy, fidelity, output.

`CONTENT_LOCK` freezes the content hash. Renderers may change presentation only.

If a discovery makes the contract impossible, reopen only the affected field with the user.
