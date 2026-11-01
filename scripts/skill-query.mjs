#!/usr/bin/env node
/** Routing skill penuh. Pakai: node scripts/skill-query.mjs "prompt" [--no-l1] [--no-log] [--n 24] [--json] */
import { route, indexState, buildIndex } from "../router/skill-db.mjs";
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const nIdx = args.indexOf("--n");
const prompt = args.filter((x, i) => !x.startsWith("--") && !(nIdx >= 0 && i === nIdx + 1)).join(" ");
if (!prompt) { console.error("prompt kosong"); process.exit(2); }
if (!indexState().fresh) await buildIndex({ quiet: true });
const r = await route(prompt, { useL1: !flag("--no-l1"), log: !flag("--no-log"), n: nIdx >= 0 ? Number(args[nIdx + 1]) : undefined });
if (flag("--json")) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`L0: ${r.l0.hit ? r.l0.sektor : "-"} | izin=${r.allowed} skill | kandidat=${r.candidates.length} | retr=${r.retr_ms}ms | vec=${r.vec} | L1=${r.l1.status}`);
  r.candidates.slice(0, 8).forEach((c) => console.log(`  #${c.rank} ${c.name} [${c.sector}] ${c.score}`));
  console.log(`PILIH (≤5): ${r.picked.join(", ") || "(tanpa skill)"}`);
}
