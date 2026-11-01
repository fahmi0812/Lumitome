# Live-state labels

| Label | Meaning |
|---|---|
| configured | File or workflow exists |
| authenticated | Credentials or app install confirmed |
| recently verified | Observed succeeding within the audit window |
| stale or broken | Present but failing, expired, or unused |
| missing | Needed capability has no surface |

## Proof

Cite at least one of: path, workflow run URL or id, hook log, config key, command output, exact error. Do not answer from memory when the live inventory can be read.

## Pitfalls

- Treating "listed in config" as "working"
- Fixing low-value overlap before naming the broken high-signal path
- Widening into a repo rewrite when the user asked for inventory
