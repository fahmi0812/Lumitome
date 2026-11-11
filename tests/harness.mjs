/** Harness bersama semua file suite (P2-3: pecah suite monolitik).
 * Dipindah verbatim dari tests/suite.mjs (prologue + blok scan-gate v0.1.1):
 * helper ok/skip + ringkasan, fixture scan-gate, dan input dasar done-gate.
 * Tiap file suite adalah satu proses node: penghitung di sini per-file;
 * tests/run.mjs menggabungkan ringkasan tiap file menjadi satu ringkasan.
 * Format baris TIDAK berubah: "[PASS] ...", "[FAIL] ..." (stderr),
 * "[SKIP] ..." — dibaca scripts/release.mjs (hanya baris berawalan [SKIP]). */
import fs from "node:fs";
import { runScanGate } from "../harness/scan-gate.ts";

let pass = 0, fail = 0, skipped = 0;
export const ok = (n, c) => { if (c) { pass++; console.log("[PASS]", n); } else { fail++; console.error("[FAIL]", n); } };
/** Tes dilewati (bukan gagal): hitung di ringkasan akhir. Format baris tetap "[SKIP] ..." (dibaca scripts/release.mjs). */
export const skip = (msg) => { skipped++; console.log("[SKIP]", msg); };
export const summaryLine = (p, f, s) => `${p} passed, ${f} failed, ${s} skipped`;
export const counts = () => ({ pass, fail, skipped });
/** Akhiri satu file suite: cetak ringkasan persis format lama, exit 1 bila ada yang gagal. */
export const finish = () => { console.log(`\n${summaryLine(pass, fail, skipped)}`); process.exit(fail ? 1 : 0); };

// --- Fixture scan-gate (v0.1.1, dipindah verbatim) ---
export const fx = (n) => JSON.parse(fs.readFileSync(`tests/fixtures/scan/${n}`, "utf8"));
export const mock = (osv, gl) => (cmd) => {
  if (cmd === "osv-scanner") return osv;
  if (cmd === "gitleaks") return gl;
  return { status: 0, stdout: "", stderr: "" };
};
export const enoent = { status: null, stdout: "", stderr: "", error: Object.assign(new Error("x"), { code: "ENOENT" }) };
export const out = (o, s = 0) => ({ status: s, stdout: JSON.stringify(o), stderr: "" });
export const sPass = runScanGate(".", mock(out(fx("osv-clean.json")), out([])));
export const sFail = runScanGate(".", mock(out(fx("osv-clean.json")), out(fx("gitleaks-leak.json"))));
export const sUnrun = runScanGate(".", mock(enoent, out([])));

// --- Input dasar done-gate (v0.1.1, dipindah verbatim) ---
export const base = { commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: 0, facts: ["FACT: npm test exit 0"], sector: "coding" };
