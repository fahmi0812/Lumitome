# SmartBook structure

Under the resolved SmartDoc root:

```text
books/<slug>/
  manifest.json
  index.json
  provenance.json
  sections/001-....md
```

Compile once. Retrieve by query. Load relevant sections only.

Same `source_sha256` → `unchanged`. Fold in new sources without duplicating unchanged sections.

Omit empty template files. A literature book needs no `formulae.md`.
