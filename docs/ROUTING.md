# Routing

## Layer-0 (0 token)
Slash commands dan regex di `router/layer0-regex.mjs`. Slash ditangani kode, bukan prosa orchestrator.
Pelebaran sektor (`router/l0.mjs`, v0.3.46): bila sektor Layer-0 menghasilkan kandidat lemah — skor fusi teratas < 0,03 DAN BM25 teratas < 12 (`SW_WIDEN_SCORE` / `SW_WIDEN_BM25`) — pencarian diulang tanpa filter sektor, bukan hanya bila fusi kosong.

## Layer-1 (1x 9router flash)
Prompt di `router/layer1-select.md`. Output JSON: `{sectors, skills[≤5], confidence, need_more}`.
Cache L1 (`runtime/l1-cache.json`, v0.3.46): TTL 7 hari (`SW_L1_CACHE_TTL_S`, sama seperti route-cache); entri tanpa stempel waktu dianggap kedaluwarsa. Bila race timeout menang, fetch L1 dibatalkan (bukan dibiarkan jalan).

## Registry
`router/skills-registry.json` — field: id, sektor, pack ("" = folder aktif, nama pack = skill pack), triggers, description 1 baris, champion/fallback, cost, requires_consent, src, sha, license.

## Lazy-load
Indeks = nama + 1 baris (`router/skills-index.md`). Body `SKILL.md` dimuat oleh executor via tool `skill` OpenCode saat dipilih.

## Log
Tulis keputusan ke `runtime/routing/<id>.json`.

## Sektor finance (4 skill aktif)
Sektor `finance` punya 4 skill aktif: akuntansi-umkm, analisis-laporan-keuangan, keuangan-pribadi, pajak-dasar-id. Routing Layer-0 (`backtest|trading|ccxt|freqtrade`) tetap mengarah ke `sectors/finance` (dry-run, bukan nasihat finansial).
