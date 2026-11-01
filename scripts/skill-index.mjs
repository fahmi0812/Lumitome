#!/usr/bin/env node
/** Bangun/cek indeks skill SQLite. Pakai: node scripts/skill-index.mjs [--check|--if-changed|--force] [--json] */
import { buildIndex, indexState, DEFAULT_DB } from "../router/skill-db.mjs";
const a = new Set(process.argv.slice(2));
const st = indexState(".", DEFAULT_DB);
if (a.has("--check")) {
  console.log(a.has("--json") ? JSON.stringify(st) : `skill-index: ${st.fresh ? "FRESH" : "STALE"} (${st.reason})`);
  process.exit(st.fresh ? 0 : 1);
}
if (a.has("--if-changed") && st.fresh) { console.log("skill-index: FRESH, lewati rebuild"); process.exit(0); }
const r = await buildIndex({});
console.log(a.has("--json") ? JSON.stringify(r) : `skill-index: dibangun ${r.file} active=${r.counts.active} pack=${r.counts.pack} disabled=${r.counts.disabled} embed=${r.embed} dim=${r.dim} hash=${r.hash.slice(0, 12)}`);
