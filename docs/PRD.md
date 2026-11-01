# PRD — Swanwright 0.1.0

## Latar
Penerus SuperQuantumAGI. Nama final: **Swanwright**. Lapisan `.opencode/` di atas OpenCode vanilla; model via 9router; tanpa LiteLLM; tanpa patch core.

## Tujuan
Harness agen yang efisien (token), efektif (done-gate berbukti), dan orchestrator tipis dengan 6 sektor + skill lazy.

## Non-goal
- Design bank (nexu-io/open-design dan sejenis) — ditolak.
- LiteLLM / proxy selain 9router.
- Patch core OpenCode.
- Auto-push ke main / auto-PR.
- Vendoring skill berlisensi proprietary / Commons Clause tanpa izin.

## Persona
Fahmi (pemilik). Agen coding OpenCode mengeksekusi di branch; Fahmi review & buka PR.

## Requirement fungsional
1. Routing 2 lapis (Layer-0 regex 0-token, Layer-1 1x 9router) + maks 3 skill + lazy-load.
2. Peran: orchestrator tipis, elephant, executor sektor (bwrap), goldfish (kompleks/release), verifier, synthesizer.
3. Done-gate FACT/JUDGMENT; UNRUN≠PASS; anti-spin max 3.
4. Packs mati default; enable via `npm run enable-pack`.
5. `/correct` → tes/rule permanen.
6. `/pentest` wajib consent+scope.

## Non-fungsional
- Node ≥ 22. Indeks aktif target ≤ ~3k token. Single-writer progress files.

## Metrik sukses
| Metrik | Target |
|---|---|
| Token prompt indeks aktif | ≤ 3000 (estimasi chars/4) |
| Routing top-1 sektor | ≥ 95% pada golden ≥120 |
| Recall@3 skill | ≥ 90% |
| Done-gate false-positive | 0 pada set eval |
| Token/tugas vs SQAGI 0.2.2 | −30% (ukur di P2) |

## Risiko & mitigasi
- Lisensi upstream: pin SHA; proprietary/Commons Clause = pointer saja.
- Keamanan pentest: consent+scope; C2 di profil mati.
- Upstream drift: `scripts/sync-upstream` re-fetch SHA pin.

## Roadmap
- **P0:** validate hijau, golden 120, orchestrator ≤600 token, packs off.
- **P1:** Elephant/Goldfish penuh, token economizer, MCP lazy per profil.
- **P2:** eval sebelum/sesudah, swarm+worktree, model 2-tier terukur.

## Keputusan default (bisa diubah)
1. 6 sektor (gamedev = pack).
2. Goldfish hanya kompleks/release.
3. OmO = pola saja, jangan vendor.
4. Port pstack (MIT) + egm (Apache-2.0).
5. Model 2 tier via 9router.
