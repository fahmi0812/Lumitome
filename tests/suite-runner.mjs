/** Tes runner suite paralel (P2-3) — TDD: ditulis dulu, merah sebelum tests/runner-lib.mjs ada.
 * Runner: tests/run.mjs (tipis, CLI) + tests/runner-lib.mjs (murni, bisa diuji).
 * Kontrak yang dijaga: tiap file suite-*.mjs satu proses node, format baris
 * [PASS]/[FAIL]/[SKIP] tidak berubah, ringkasan gabungan = jumlah per-file,
 * durasi tercatat di ringkasan akhir. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ok, skip, finish, summaryLine } from "./harness.mjs";
import { parseSummaryLine, aggregateResults, runFiles, discoverSuiteFiles } from "./runner-lib.mjs";

// --- parseSummaryLine: murni ---
ok("runner: parseSummaryLine baca 'N passed, N failed, N skipped'",
  JSON.stringify(parseSummaryLine("486 passed, 0 failed, 2 skipped")) === JSON.stringify({ pass: 486, fail: 0, skipped: 2 })
  && JSON.stringify(parseSummaryLine("0 passed, 1 failed, 0 skipped")) === JSON.stringify({ pass: 0, fail: 1, skipped: 0 }));
ok("runner: parseSummaryLine toleran awalan/akhiran (durasi runner, newline)",
  JSON.stringify(parseSummaryLine("486 passed, 0 failed, 2 skipped (12.3s, 7 file)")) === JSON.stringify({ pass: 486, fail: 0, skipped: 2 })
  && JSON.stringify(parseSummaryLine("\n486 passed, 0 failed, 2 skipped\n")) === JSON.stringify({ pass: 486, fail: 0, skipped: 2 }));
ok("runner: parseSummaryLine null untuk baris bukan ringkasan",
  parseSummaryLine("[PASS] sesuatu") === null && parseSummaryLine("486 passed") === null && parseSummaryLine("") === null);

// --- aggregateResults: murni ---
ok("runner: aggregateResults menjumlah per-file; ok=false bila ada gagal",
  (() => { const a = aggregateResults([
    { file: "a", pass: 10, fail: 0, skipped: 1, status: 0 },
    { file: "b", pass: 5, fail: 1, skipped: 0, status: 1 },
  ]); return a.pass === 15 && a.fail === 1 && a.skipped === 1 && a.ok === false; })());
ok("runner: aggregateResults ok=true bila semua lolos; file crash dihitung gagal",
  (() => { const a = aggregateResults([
    { file: "a", pass: 3, fail: 0, skipped: 0, status: 0 },
    { file: "b", pass: 0, fail: 0, skipped: 0, status: 1, crashed: true },
  ]); return a.ok === false && a.fail === 1; })());

// --- runFiles: integrasi dengan fixture kecil (tanpa suite asli) ---
const mkFixtureDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-runner-"));
  const w = (name, body) => fs.writeFileSync(path.join(d, name), body);
  w("a-pass.mjs", `console.log("[PASS] a1");\nconsole.log("[PASS] a2");\nconsole.log("\\n2 passed, 0 failed, 0 skipped");\n`);
  w("b-skip.mjs", `console.log("[PASS] b1");\nconsole.log("[SKIP] chrome tidak ada");\nconsole.log("\\n1 passed, 0 failed, 1 skipped");\n`);
  w("c-fail.mjs", `console.log("[PASS] c1");\nconsole.error("[FAIL] c2");\nconsole.log("\\n1 passed, 1 failed, 0 skipped");\nprocess.exit(1);\n`);
  w("d-crash.mjs", `console.log("[PASS] d1");\nthrow new Error("boom");\n`);
  return d;
};
{
  const d = mkFixtureDir();
  const r = await runFiles([path.join(d, "a-pass.mjs"), path.join(d, "b-skip.mjs")], { cwd: d, jobs: 2 });
  ok("runner: runFiles gabungkan ringkasan 2 file lolos (3 passed, 0 failed, 1 skipped)",
    r.pass === 3 && r.fail === 0 && r.skipped === 1 && r.ok === true && typeof r.durationMs === "number" && r.durationMs >= 0);
  ok("runner: runFiles teruskan baris [SKIP] dari anak (dibaca release.mjs)",
    r.perFile.some((f) => f.output.includes("[SKIP] chrome tidak ada")));
  fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = mkFixtureDir();
  const r = await runFiles([path.join(d, "a-pass.mjs"), path.join(d, "c-fail.mjs")], { cwd: d, jobs: 2 });
  ok("runner: runFiles gagal bila satu file gagal (exit agregat 1)",
    r.ok === false && r.fail === 1 && r.pass === 3);
  fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = mkFixtureDir();
  const r = await runFiles([path.join(d, "d-crash.mjs")], { cwd: d, jobs: 1 });
  ok("runner: file crash tanpa ringkasan dihitung gagal (bukan lolos diam-diam)",
    r.ok === false && r.fail === 1 && r.perFile[0].crashed === true);
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // fail-fast: file kedua TIDAK boleh jalan bila file pertama gagal.
  const d = mkFixtureDir();
  fs.writeFileSync(path.join(d, "e-marker.mjs"), `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(path.join(d, "marker"))}, "jalan");\nconsole.log("[PASS] e1");\nconsole.log("\\n1 passed, 0 failed, 0 skipped");\n`);
  const r = await runFiles([path.join(d, "c-fail.mjs"), path.join(d, "e-marker.mjs")], { cwd: d, jobs: 1, failFast: true });
  ok("runner: --fail-fast menghentikan antrean setelah file pertama gagal",
    r.ok === false && !fs.existsSync(path.join(d, "marker")));
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // serial: hasil sama seperti paralel (urutan output deterministik = urutan file).
  const d = mkFixtureDir();
  const r = await runFiles([path.join(d, "b-skip.mjs"), path.join(d, "a-pass.mjs")], { cwd: d, serial: true });
  ok("runner: mode serial hasil agregat sama (3 passed, 0 failed, 1 skipped)",
    r.pass === 3 && r.fail === 0 && r.skipped === 1 && r.ok === true);
  fs.rmSync(d, { recursive: true, force: true });
}

// --- discoverSuiteFiles: daftar file suite asli ---
{
  const testsDir = path.dirname(new URL(import.meta.url).pathname);
  const files = discoverSuiteFiles(testsDir);
  ok("runner: discoverSuiteFiles menemukan file suite-*.mjs terurut (tanpa harness/runner-lib)",
    files.length >= 7 && files.every((f) => /suite-[a-z-]+\.mjs$/.test(f))
    && !files.some((f) => f.endsWith("harness.mjs") || f.endsWith("runner-lib.mjs"))
    && JSON.stringify(files) === JSON.stringify([...files].sort()));
}

// --- Ringkasan menghitung skipped (P0-3, diadaptasi untuk suite terpecah) ---
// Dulu: tes ini membaca tests/suite.mjs. Kini skip() tinggal di harness.mjs
// (satu-satunya console.log("[SKIP]") dan satu-satunya definisi skip),
// dan situs pemanggil skip() tersebar di file-file suite domain (maks. 2 situs:
// service e2e + design-gate red-test) — hitungan gabungan tetap 2.
// File ini sendiri (suite-runner.mjs) tidak dihitung: ia menguji runner,
// dan sumbernya menyebut skip() di komentar/fixture.
ok("ringkasan: format 'N passed, N failed, N skipped'",
  summaryLine(382, 0, 2) === "382 passed, 0 failed, 2 skipped" && summaryLine(0, 1, 0) === "0 passed, 1 failed, 0 skipped");
ok("ringkasan: skipped terhitung dari skip() (maks. 2 situs di seluruh file suite)",
  (() => {
    const testsDir = path.dirname(new URL(import.meta.url).pathname);
    const files = fs.readdirSync(testsDir).filter((f) => /^suite-[a-z-]+\.mjs$/.test(f) && f !== "suite-runner.mjs");
    let sites = 0;
    for (const f of files) { const src = fs.readFileSync(path.join(testsDir, f), "utf8"); sites += (src.match(/(^|[^\w])skip\(/g) || []).length; }
    const harness = fs.readFileSync(path.join(testsDir, "harness.mjs"), "utf8");
    const defs = (harness.match(/console\.log\("\[SKIP\]"/g) || []).length;
    return sites === 2 && defs === 1;
  })());

// --- v0.3.82: [FAIL] menunjukkan lokasi + sumber + detail; okEach menyebut bagian yang gagal ---
{
  const cp = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "tmp-diag-"));
  const f = path.join(dir, "suite-diag.mjs");
  const rel = path.relative(dir, path.join(path.dirname(new URL(import.meta.url).pathname), "harness.mjs")).split(path.sep).join("/");
  fs.writeFileSync(f, [
    `import { ok, okEach, finish } from "${rel.startsWith(".") ? rel : "./" + rel}";`,
    `const actual = { port: 49374 };`,
    `ok("lolos", true);`,
    `ok("gagal dengan detail",`,
    `  actual.port === 1234 && true, () => actual);`,
    `okEach("gagal bertahap", { "port benar": actual.port === 49374, "nama cocok": () => "a" === "b", "tidak melempar": () => { throw new Error("boom"); } });`,
    `okEach("bertahap lolos", { a: true, b: () => 1 === 1 });`,
    `finish();`,
  ].join("\n"));
  const r = cp.spawnSync(process.execPath, [f], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  const err = r.stderr || "", outp = r.stdout || "";
  ok("diag: [FAIL] mencetak file:baris panggilan ok() (bukan baris harness)", /\[FAIL\] gagal dengan detail\n    at \S*suite-diag\.mjs:4\n/.test(err), err);
  ok("diag: [FAIL] mencetak potongan sumber asersi multi-baris", /ok\("gagal dengan detail", actual\.port === 1234 && true, \(\) => actual\);/.test(err), err);
  ok("diag: detail fungsi dievaluasi hanya saat gagal dan dicetak", /detail: \{"port":49374\}/.test(err), err);
  ok("diag: okEach menyebut label yang false + yang melempar, bukan yang benar", /gagal: nama cocok, tidak melempar \(melempar: boom\)/.test(err) && !/gagal: .*port benar/.test(err), err);
  ok("diag: format [PASS]/ringkasan tetap + exit 1 bila ada gagal", /\[PASS\] lolos/.test(outp) && /\[PASS\] bertahap lolos/.test(outp) && /2 passed, 2 failed, 0 skipped/.test(outp) && r.status === 1, { status: r.status, outp });
}

finish();
