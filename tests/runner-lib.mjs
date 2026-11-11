/** Runner suite paralel (P2-3) — logika murni, bisa diuji tanpa menjalankan suite.
 * Kontrak: tiap file suite-*.mjs adalah satu proses node (isolasi env +
 * tanpa impor silang antar-file pecah); format baris [PASS]/[FAIL]/[SKIP]
 * tidak berubah; ringkasan gabungan = jumlah per-file; file yang crash
 * tanpa ringkasan dihitung GAGAL (bukan lolos diam-diam — fail-closed).
 * CLI tipisnya: tests/run.mjs. */
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const SUMMARY_RE = /(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+skipped/;

/** Parse satu baris ringkasan "N passed, N failed, N skipped" (toleran
 *  awalan newline + akhiran durasi runner). Bukan ringkasan -> null. */
export function parseSummaryLine(line) {
  const m = SUMMARY_RE.exec(String(line || ""));
  if (!m) return null;
  return { pass: Number(m[1]), fail: Number(m[2]), skipped: Number(m[3]) };
}

/** Jumlahkan hasil per-file. File crash / exit != 0 tanpa fail terhitung
 *  dihitung 1 gagal (fail-closed); ok hanya bila semua lolos. */
export function aggregateResults(results) {
  let pass = 0, fail = 0, skipped = 0, ok = true;
  for (const r of results) {
    pass += r.pass || 0;
    skipped += r.skipped || 0;
    fail += r.fail || 0;
    if (r.status !== 0 || r.crashed) {
      ok = false;
      if ((r.fail || 0) === 0) fail += 1; // exit != 0 / crash tanpa fail terhitung
    }
    if ((r.fail || 0) > 0) ok = false;
  }
  return { pass, fail, skipped, ok };
}

/** Temukan file suite di satu direktori tests/: tests/suite-*.mjs terurut.
 *  harness.mjs / runner-lib.mjs / run.mjs bukan file suite (tidak cocok pola). */
export function discoverSuiteFiles(testsDir) {
  return fs.readdirSync(testsDir)
    .filter((f) => /^suite-[a-z-]+\.mjs$/.test(f))
    .sort()
    .map((f) => path.join(testsDir, f));
}

function runOne(file, cwd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = cp.spawn(process.execPath, ["--experimental-strip-types", file], { cwd, env: process.env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => resolve({ file, pass: 0, fail: 0, skipped: 0, status: 1, crashed: true, durationMs: Date.now() - t0, output: stdout + stderr + String(e?.message || e) }));
    child.on("close", (status) => {
      // Ringkasan file = baris ringkasan TERAKHIR di stdout (file mencetaknya di akhir).
      let parsed = null;
      for (const line of stdout.split("\n")) { const p = parseSummaryLine(line); if (p) parsed = p; }
      const crashed = parsed === null;
      resolve({
        file,
        pass: parsed?.pass ?? 0,
        fail: parsed?.fail ?? 0,
        skipped: parsed?.skipped ?? 0,
        status: status ?? 1,
        crashed,
        durationMs: Date.now() - t0,
        output: stdout + stderr,
      });
    });
  });
}

/** Jalankan daftar file suite (absolut) sebagai proses anak.
 *  Default paralel (jobs = min(4, jumlah file)); serial bila jobs=1 atau
 *  opts.serial; failFast berhenti memulai file baru setelah satu gagal.
 *  Output tiap anak dicetak ulang oleh pemanggil dalam urutan file (bukan
 *  urutan selesai) agar output deterministik. */
export async function runFiles(files, opts = {}) {
  const t0 = Date.now();
  const cwd = opts.cwd || process.cwd();
  const jobs = opts.serial ? 1 : Math.max(1, Math.min(opts.jobs || 4, files.length || 1));
  const failFast = !!opts.failFast;
  const perFile = new Array(files.length).fill(null);
  let next = 0, stopped = false;
  const worker = async () => {
    while (!stopped) {
      const i = next++;
      if (i >= files.length) return;
      const r = await runOne(files[i], cwd);
      perFile[i] = r;
      if (failFast && (r.status !== 0 || r.crashed || r.fail > 0)) stopped = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, () => worker()));
  const done = perFile.filter(Boolean);
  const agg = aggregateResults(done);
  return { ...agg, durationMs: Date.now() - t0, perFile: done };
}
