# Local Similarity Audit

Load only when originality is not OFF.

Run `node harness/smartdoc/cli.mjs smartdoc originality PATH --against FILE`. The report must name the corpus. It is similarity against those sources, not a global internet or Turnitin database.

- Do not label output Turnitin, official Turnitin, or 0% Turnitin.
- Do not promise undetectable AI or run `while score: rewrite()`.
- Quotes may be excluded. Keep legitimate citations, bibliography, standard terms, and formulae.
- REPORT_ASSISTED: treat a user-supplied report as `audit_report`. Classify matches; fix only problematic close copying; then semantic regression.

Product language tests live in `lib/smartdoc/originality.py`.
