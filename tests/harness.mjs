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

// --- Diagnostik kegagalan (v0.3.82) ---
// Asersi di suite ditulis `ok(nama, a && b && c)`: kondisinya sudah dievaluasi
// sebelum ok() dipanggil, jadi [FAIL] dulu hanya berarti "false" tanpa petunjuk.
// Sekarang setiap [FAIL] mencetak lokasi (file:baris) dan potongan sumber
// panggilan ok(...) dari file suite, plus `detail` opsional. Baris tambahan
// berawalan "    " dan ke stderr; format "[PASS]/[FAIL]/[SKIP] ..." tetap.
const callSite = () => {
  for (const l of (new Error().stack || "").split("\n").slice(1)) {
    const m = l.match(/\(?((?:file:\/\/)?[^()\s]+):(\d+):\d+\)?\s*$/);
    if (m && !/\/tests\/harness\.mjs$/.test(m[1]) && !m[1].startsWith("node:")) return { file: m[1].replace(/^file:\/\//, ""), line: Number(m[2]) };
  }
  return null;
};
const excerpt = (file, line, maxLines = 8, maxChars = 700) => {
  let src; try { src = fs.readFileSync(decodeURIComponent(file), "utf8").split("\n"); } catch { return ""; }
  // Ambil baris dari pemanggilan sampai kurung seimbang (perkiraan; kurung di dalam string bisa mengacaukan, maka dibatasi maxLines).
  const out = []; let depth = 0;
  for (let i = line - 1; i < src.length && out.length < maxLines; i++) {
    out.push(src[i]); for (const ch of src[i]) depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
    if (depth <= 0) break;
  }
  const s = out.map((x) => x.trim()).join(" ");
  return s.length > maxChars ? s.slice(0, maxChars) + " …" : s;
};
const show = (v) => { try { return typeof v === "string" ? v : JSON.stringify(v, (_, x) => (x instanceof Error ? x.message : x)); } catch { return String(v); } };
const explainFail = (detail) => {
  const at = callSite();
  if (at) { console.error(`    at ${at.file.replace(process.cwd() + "/", "")}:${at.line}`); const ex = excerpt(at.file, at.line); if (ex) console.error(`    ${ex}`); }
  if (detail !== undefined) { let d = detail; if (typeof d === "function") { try { d = d(); } catch (e) { d = `detail() melempar: ${e.message}`; } } console.error(`    detail: ${show(d).slice(0, 2000)}`); }
};

/** Asersi. `detail` (nilai atau fungsi, opsional) hanya dicetak/dievaluasi saat gagal — taruh nilai aktual di sini. */
export const ok = (n, c, detail) => { if (c) { pass++; console.log("[PASS]", n); } else { fail++; console.error("[FAIL]", n); explainFail(detail); } };
/**
 * Asersi bertahap: `parts` = { label: boolean | () => boolean }. Satu baris [PASS]/[FAIL]
 * seperti ok(), tapi saat gagal menyebut label mana yang false (fungsi yang melempar = false).
 * Pakai untuk asersi baru alih-alih rantai `a && b && c`.
 */
export const okEach = (n, parts, detail) => {
  const failed = [];
  for (const [label, p] of Object.entries(parts)) { let v; try { v = typeof p === "function" ? p() : p; } catch (e) { v = false; failed.push(`${label} (melempar: ${e.message})`); continue; } if (!v) failed.push(label); }
  if (!failed.length) { pass++; console.log("[PASS]", n); return; }
  fail++; console.error("[FAIL]", n); console.error(`    gagal: ${failed.join(", ")}`); explainFail(detail);
};
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
