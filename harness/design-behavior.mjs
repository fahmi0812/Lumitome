/**
 * Lumitome behavior gate — probe interaksi terskrip tiap iterasi (v0.3.31 §1).
 * Maker mendeklarasikan KONTRAK INTERAKSI halaman (seperti direction-first
 * untuk desain): daftar interaksi + keadaan awal yang diharapkan + hasil
 * klik yang diharapkan. Probe menjalankan asersi itu di browser sungguhan
 * (CDP, pola yang sama dengan design-measure) dan melaporkan pass/fail per
 * item sebagai findings gate (check "behavior" / "probe-gagal").
 *
 * Kontrak — objek {checks: [...]} atau {initial: [...], actions: [...]}:
 *   {id, label, kind, selector, expected, click?, attr?, waitMs?}
 * kinds:
 *   text-equals     — textContent(selector) === expected
 *   text-contains   — textContent(selector) mengandung expected
 *   count           — jumlah elemen cocok (terlihat) === expected
 *   exists          — ada/tidaknya elemen === expected (true/false)
 *   attr-equals     — getAttribute(attr) === expected
 *   click-then-text — klik `click`, lalu textContent(selector) === expected
 *   click-then-count— klik `click`, lalu jumlah elemen cocok === expected
 * Contoh: {id: "cart-empty", label: "keranjang kosong saat dimuat",
 *   kind: "text-equals", selector: "#cart-total-display", expected: "¥0"}.
 *
 * Probe tidak boleh rapuh: tiap check timeout singkat (5 detik); gagal
 * probe (timeout, elemen tak ditemukan, browser mati) = finding
 * "probe-gagal", BUKAN crash loop. Gagal launch browser pun dikembalikan
 * sebagai satu hasil probe-gagal, bukan throw.
 *
 * State loop (§5 v0.3.31): recordLoopIteration/readLoopCounts/stuckVerdict
 * menyimpan jumlah findings per iterasi di <stateDir>/loop-history.jsonl
 * (di dalam workspace, mis. <workspace>/.tmp/loopdesign/) supaya loop bisa
 * berhenti dini dengan vonis "mentok di N findings".
 *
 * Pure ESM, zero-dep (selain CDP skill + design-measure yang sudah ada).
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Browser } from "../.opencode/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { measureAndGate, resolveChromePath, serveLocal } from "./design-measure.mjs";
import { checkStuck, evaluateBehavior } from "./design-gate.mjs";

/** Timeout per check probe (ms) — singkat supaya probe tidak menggantung loop. */
export const PROBE_TIMEOUT_MS = 5000;
/** Jeda default setelah klik sebelum membaca hasil (ms). */
export const DEFAULT_WAIT_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- runner di dalam halaman (self-contained, diserialisasi ke CDP) ----------
/* eslint-disable no-undef */
// Fungsi ini jalan DI DALAM browser — tidak boleh import / closure ke scope modul.
export async function runBehaviorCheckInPage(check) {
  const sleepInPage = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05;
  };
  const textOf = (el) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  const find = (selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`elemen tidak ditemukan: ${selector}`);
    return el;
  };
  const kind = check.kind;
  if (kind === "click-then-text" || kind === "click-then-count") {
    const btn = find(check.click);
    btn.click();
    await sleepInPage(typeof check.waitMs === "number" ? check.waitMs : 400);
  }
  if (kind === "text-equals" || kind === "click-then-text") {
    const actual = textOf(find(check.selector));
    return { passed: actual === String(check.expected), actual, detail: `teks '${check.selector}' = '${actual.slice(0, 80)}', diharapkan '${String(check.expected).slice(0, 80)}'` };
  }
  if (kind === "text-contains") {
    const actual = textOf(find(check.selector));
    return { passed: actual.includes(String(check.expected)), actual, detail: `teks '${check.selector}' = '${actual.slice(0, 80)}', diharapkan mengandung '${String(check.expected).slice(0, 80)}'` };
  }
  if (kind === "count" || kind === "click-then-count") {
    const all = [...document.querySelectorAll(check.selector)];
    const actual = all.filter(visible).length;
    return { passed: actual === Number(check.expected), actual, detail: `jumlah elemen terlihat '${check.selector}' = ${actual}, diharapkan ${check.expected}` };
  }
  if (kind === "exists") {
    const actual = document.querySelector(check.selector) !== null;
    return { passed: actual === !!check.expected, actual, detail: `elemen '${check.selector}' ${actual ? "ada" : "tidak ada"}, diharapkan ${check.expected ? "ada" : "tidak ada"}` };
  }
  if (kind === "attr-equals") {
    const actual = find(check.selector).getAttribute(check.attr ?? "");
    return { passed: actual === String(check.expected), actual, detail: `atribut ${check.attr} '${check.selector}' = '${String(actual).slice(0, 80)}', diharapkan '${String(check.expected).slice(0, 80)}'` };
  }
  throw new Error(`kind probe tidak dikenal: ${kind}`);
}
/* eslint-enable no-undef */

// ---------- kontrak ----------

/** Normalisasi kontrak ke daftar checks (id default check-1, check-2, ...). */
export function normalizeContract(contract) {
  const list = Array.isArray(contract)
    ? contract
    : [...(contract?.initial ?? []), ...(contract?.actions ?? []), ...(contract?.checks ?? [])];
  return list.map((c, i) => ({ id: c.id ?? `check-${i + 1}`, label: c.label ?? c.id ?? `check-${i + 1}`, waitMs: c.waitMs ?? DEFAULT_WAIT_MS, ...c }));
}

/**
 * Baca kontrak interaksi dari file: `behavior.json` (JSON langsung) atau
 * `DESIGN.md` (blok fenced ```behavior-contract ... ```). → objek kontrak.
 * Throw bila file tidak ada / JSON rusak — caller yang memutuskan (bukan
 * probe yang diam-diam jalan tanpa kontrak).
 */
export function parseBehaviorContract(path) {
  const raw = readFileSync(resolve(path), "utf8");
  if (/\.json$/i.test(path)) return JSON.parse(raw);
  const m = raw.match(/```behavior-contract\s*\n([\s\S]*?)```/);
  if (!m) throw new Error(`DESIGN.md ${path} tidak memuat blok \`\`\`behavior-contract — tulis kontrak interaksi di sana atau pakai behavior.json`);
  return JSON.parse(m[1]);
}

// ---------- probe ----------

/** Satu check di browser, dengan timeout — gagal = hasil probe-gagal (bukan throw). */
async function runCheck(page, check, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const base = { id: check.id, label: check.label };
  try {
    const r = await Promise.race([
      page.eval(runBehaviorCheckInPage, check),
      sleep(timeoutMs).then(() => { throw new Error(`timeout ${timeoutMs}ms`); }),
    ]);
    return { ...base, passed: !!r.passed, actual: r.actual ?? null, detail: r.detail ?? "" };
  } catch (e) {
    return { ...base, passed: false, error: String(e?.message ?? e).slice(0, 160) };
  }
}

/**
 * Jalankan kontrak di browser sungguhan.
 * target: URL http(s) atau path file .html lokal.
 * → {checks: [{id, label, passed, actual?, detail?, error?}], pass, findings}.
 * TIDAK PERNAH throw untuk kegagalan probe — gagal launch pun jadi satu
 * hasil probe-gagal (loop tetap jalan, gate yang memvonis).
 */
export async function probeBehavior(target, contract, opts = {}) {
  const checks = normalizeContract(contract);
  if (checks.length === 0) return { checks: [], pass: true, findings: [] };
  const chrome = resolveChromePath();
  if (!chrome) {
    const r = { id: "probe-launch", label: "probe browser", passed: false, error: "Chrome tidak ditemukan (set CHROME_PATH)" };
    return { checks: [r], pass: false, findings: evaluateBehavior([r]) };
  }
  let url = target, server = null;
  if (!/^https?:\/\//.test(target)) {
    if (!existsSync(resolve(target))) {
      const r = { id: "probe-launch", label: "probe browser", passed: false, error: `file tidak ada: ${target}` };
      return { checks: [r], pass: false, findings: evaluateBehavior([r]) };
    }
    ({ server, url } = await serveLocal(target));
  }
  let browser = null;
  try {
    browser = await Browser.launch({
      extraArgs: typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : [],
    });
    const page = await browser.newPage({ width: 1440, height: 900, dsf: 1 });
    try {
      await page.goto(url, { timeoutMs: 30000, settleMs: 800 });
      const results = [];
      for (const check of checks) results.push(await runCheck(page, check, opts));
      return { checks: results, pass: results.every((r) => r.passed), findings: evaluateBehavior(results) };
    } finally {
      await page.close();
    }
  } catch (e) {
    const r = { id: "probe-launch", label: "probe browser", passed: false, error: String(e?.message ?? e).slice(0, 160) };
    return { checks: [r], pass: false, findings: evaluateBehavior([r]) };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
}

/**
 * Probe + ukur + gate sekaligus (satu panggilan per iterasi loop):
 * probe behavior dulu, lalu measureAndGate dengan hasilnya.
 * → {pass, findings, behavior, screenshots, input} (behavior = checks probe).
 */
export async function measureAndGateWithBehavior(target, opts = {}) {
  let behavior = null;
  if (opts.behaviorContract) {
    const probe = await probeBehavior(target, opts.behaviorContract, opts);
    behavior = probe.checks;
  }
  const gate = await measureAndGate(target, { ...opts, behavior });
  return { ...gate, behavior };
}

// ---------- state loop (§5) ----------

/** Simpan satu iterasi loop ke <stateDir>/loop-history.jsonl (append JSONL). */
export function recordLoopIteration(stateDir, { iteration, findings, pass } = {}) {
  const dir = resolve(stateDir);
  mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ iteration, findings: Number(findings), pass: !!pass, at: new Date().toISOString() });
  appendFileSync(join(dir, "loop-history.jsonl"), line + "\n", "utf8");
  return line;
}

/** Jumlah findings per iterasi, urut — dibaca dari loop-history.jsonl. */
export function readLoopCounts(stateDir) {
  const file = join(resolve(stateDir), "loop-history.jsonl");
  if (!existsSync(file)) return [];
  const counts = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const n = Number(JSON.parse(line).findings);
      if (Number.isFinite(n)) counts.push(n);
    } catch { /* baris rusak dilewati */ }
  }
  return counts;
}

/** Vonis mentok dari state loop: {stuck, findings, verdict} (lihat checkStuck). */
export function stuckVerdict(stateDir) {
  return checkStuck(readLoopCounts(stateDir));
}
