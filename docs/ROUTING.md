# Routing

## Layer-0 (0 token)
Slash commands dan regex di `router/layer0-regex.mjs`. Slash ditangani kode, bukan prosa orchestrator.

## Layer-1 (1x 9router flash)
Prompt di `router/layer1-prompt.md`. Output JSON: sektor, complexity, skills[≤3], needs_elephant/goldfish/consent, restate.

## Registry
`router/skills-registry.json` — field: id, sektor, triggers, description 1 baris, champion/fallback, cost, requires_consent, src, sha, license.

## Lazy-load
Indeks = nama + 1 baris (`router/skills-index.md`). Body `SKILL.md` dimuat oleh executor via tool `skill` OpenCode saat dipilih.

## Log
Tulis keputusan ke `runtime/routing/<id>.json`.

## Sektor finance (v0.1.4, tetap di v0.1.5)
Sektor `finance` belum punya skill aktif maupun pack: belum ada sumber upstream yang memenuhi syarat (lisensi jelas + SHA ter-pin). Routing Layer-0 (`backtest|trading|ccxt|freqtrade`) tetap mengarah ke `sectors/finance`, yang bekerja tanpa skill (dry-run, bukan nasihat finansial).
