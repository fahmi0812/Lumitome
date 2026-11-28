#!/usr/bin/env node
/** Runner suite (P2-3) — CLI tipis di atas tests/runner-lib.mjs.
 *  Pakai: npm test
 *    node tests/run.mjs [--serial] [--jobs N] [--fail-fast] [filter...]
 *  Filter posisi = substring nama file (mis. `node tests/run.mjs routing`).
 *  Tiap file tests/suite-*.mjs jalan sebagai satu proses node (isolasi env,
 *  tanpa impor silang antar-file pecah). Output tiap anak dicetak verbatim
 *  dalam urutan file (deterministik), lalu ringkasan gabungan + durasi.
 *  Format baris [PASS]/[FAIL]/[SKIP] tidak berubah (dibaca release.mjs).
 *  Exit 1 bila ada gagal/crash; 0 bila semua lolos. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSuiteFiles, runFiles } from "./runner-lib.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testsDir);
const args = process.argv.slice(2);
let serial = false, failFast = false, jobs = 0;
const filters = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--serial") serial = true;
  else if (a === "--fail-fast") failFast = true;
  else if (a === "--jobs") { jobs = Number(args[++i]); if (!Number.isInteger(jobs) || jobs < 1) { console.error("run.mjs: --jobs butuh bilangan bulat >= 1"); process.exit(2); } }
  else if (a.startsWith("--")) { console.error(`run.mjs: flag tak dikenal ${a}`); process.exit(2); }
  else filters.push(a);
}
const all = discoverSuiteFiles(testsDir);
const files = filters.length ? all.filter((f) => filters.some((s) => path.basename(f).includes(s))) : all;
if (files.length === 0) { console.error("run.mjs: tidak ada file suite yang cocok"); process.exit(2); }
const writeAll = (stream, text) => new Promise((resolve, reject) => {
  if (!text) return resolve();
  stream.write(text, (err) => (err ? reject(err) : resolve()));
});

const r = await runFiles(files, { cwd: repoRoot, jobs: jobs || undefined, failFast, serial });
for (const f of r.perFile) await writeAll(process.stdout, f.output);
await writeAll(process.stdout, `\n${r.pass} passed, ${r.fail} failed, ${r.skipped} skipped (${(r.durationMs / 1000).toFixed(1)}s, ${r.perFile.length} file)\n`);
if (!r.ok) {
  const failedFiles = r.perFile.filter((f) => f.status !== 0 || f.crashed || f.fail > 0);
  const summaryLines = ["\n=== RINGKASAN KEGAGALAN (tests/run.mjs) ==="];
  for (const f of failedFiles) {
    const rel = path.relative(repoRoot, f.file);
    summaryLines.push(`- ${rel} (exit=${f.status}, fail=${f.fail}, crashed=${Boolean(f.crashed)})`);
    const lines = String(f.output || "").split("\n");
    const failLines = lines.filter((l) => /\[FAIL\]|^\s+at\s+|^\s+detail:|^\s+gagal:|Error:|TypeError:|SyntaxError:/.test(l));
    for (const fl of (failLines.length ? failLines.slice(0, 40) : lines.slice(-15).filter(Boolean))) {
      summaryLines.push(`  ${fl}`);
    }
  }
  await writeAll(process.stderr, summaryLines.join("\n") + "\n");
}
process.exitCode = r.ok ? 0 : 1;
