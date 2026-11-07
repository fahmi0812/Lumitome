# Routing

## Layer-0 (0 token)
Slash commands dan regex di `router/layer0-regex.mjs`. Slash ditangani kode, bukan prosa orchestrator.

## Layer-1 (1x 9router flash)
Prompt di `router/layer1-select.md`. Output JSON: `{sectors, skills[≤5], confidence, need_more}`.

## Registry
`router/skills-registry.json` — field: id, sektor, triggers, description 1 baris, champion/fallback, cost, requires_consent, src, sha, license.

## Lazy-load
Indeks = nama + 1 baris (`router/skills-index.md`). Body `SKILL.md` dimuat oleh executor via tool `skill` OpenCode saat dipilih.

## Log
Tulis keputusan ke `runtime/routing/<id>.json`.

## Sektor finance (4 skill aktif)
Sektor `finance` punya 4 skill aktif: akuntansi-umkm, analisis-laporan-keuangan, keuangan-pribadi, pajak-dasar-id. Routing Layer-0 (`backtest|trading|ccxt|freqtrade`) tetap mengarah ke `sectors/finance` (dry-run, bukan nasihat finansial).
