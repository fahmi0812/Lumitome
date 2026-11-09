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
 *   click-then-attr — klik `click`, lalu getAttribute(attr) === expected
 * Contoh: {id: "cart-empty", label: "keranjang kosong saat dimuat",
 *   kind: "text-equals", selector: "#cart-total-display", expected: "¥0"}.
 *
 * Kontrak default turunan DOM (v0.3.32 §1 — "kontrak yang tidak bisa
 * dilewati"): bila Maker tidak menulis kontrak, probe TIDAK dilewati
 * diam-diam. `deriveDefaultContract(page)` menurunkan checks generik dari
 * DOM live — hanya yang bisa diturunkan dengan keyakinan tinggi (keranjang
 * kosong saat dimuat, klik tambah = tepat 1 item, filter menyaring, form
 * kosong = error muncul, toggle ganti state). Yang tidak bisa diturunkan
 * TIDAK diada-adakan. Bila tidak satu pun check bisa diturunkan, probe
 * mengembalikan SATU finding warn "tidak ada interaksi yang bisa diprobe"
 * — bukan skip diam-diam, bukan fail (warn tidak mengubah vonis pass).
 * `measureAndGateWithBehavior` menjalankan probe SELALU tiap iterasi:
 * kontrak eksplisit > kontrak default turunan > finding warn.
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
/** Detail finding warn bila kontrak default menghasilkan 0 checks (v0.3.32 §1). */
export const NO_CHECKS_WARN_DETAIL = "tidak ada interaksi yang bisa diprobe dari DOM — tulis kontrak eksplisit di DESIGN.md bila halaman punya interaksi yang harus diuji";

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
  if (kind === "click-then-text" || kind === "click-then-count" || kind === "click-then-attr") {
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
  if (kind === "attr-equals" || kind === "click-then-attr") {
    const actual = find(check.selector).getAttribute(check.attr ?? "");
    return { passed: actual === String(check.expected), actual, detail: `atribut ${check.attr} '${check.selector}' = '${String(actual).slice(0, 80)}', diharapkan '${String(check.expected).slice(0, 80)}'` };
  }
  throw new Error(`kind probe tidak dikenal: ${kind}`);
}

// ---------- kontrak default turunan DOM (v0.3.32 §1) ----------
// Fungsi ini jalan DI DALAM browser — self-contained, tanpa import/closure.
// Hanya menurunkan checks yang bisa diturunkan dengan keyakinan tinggi:
//   cart-empty  — elemen total keranjang terdeteksi → teks awal harus nol
//                 ("Rp0"/"¥0"/"0"; keranjang prefill = FAIL).
//   cart-add    — tombol tambah + harga (data-price / teks harga) → total
//                 setelah 1 klik == harga 1 item (double-add = FAIL).
//   filter      — tombol [data-filter] + elemen [data-category] → klik satu
//                 filter non-"all", kartu kategori lain yang terlihat == 0.
//   form-empty  — <form novalidate> + SATU elemen error tersembunyi → klik
//                 submit, elemen error terlihat == 1.
//   theme-toggle— tombol tema/mode + data-theme light/dark di <html> → klik,
//                 atribut jadi nilai lawannya.
// Yang tidak bisa diturunkan TIDAK diada-adakan (mis. form dengan 3 error,
// tombol tambah tanpa harga yang bisa diverifikasi, filter tanpa kategori
// yang cocok). → {contract: {initial, actions}, derived: [id...],
// interactive: boolean} — interactive = halaman punya button/input.
export function deriveDefaultContractInPage() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05;
  };
  const directText = (el) => {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.replace(/\s+/g, " ").trim();
  };
  const textOf = (el) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  // "Rp18.000" / "¥12.000" / "Rp 18.000" / "$12,000" / "18000" / "0" →
  // {value, prefix, raw} (raw = string harga apa adanya, mis. "Rp18.000").
  // Desimal ("12.00") dibedakan dari ribuan ("12.000") lewat panjang grup.
  const parseMoney = (s) => {
    const m = String(s).match(/([A-Za-z¥$€£]{0,4})?\s*(\d[\d.,]*)/);
    if (!m) return null;
    const rawNum = m[2].replace(/\s/g, "");
    if (!/^\d/.test(rawNum)) return null;
    const parts = rawNum.split(/[.,]/);
    let value;
    if (parts.length === 1) value = Number(rawNum);
    else if (parts.length === 2 && parts[1].length === 2) value = Number(parts.join("."));
    else if (parts.slice(1).every((p) => p.length === 3)) value = Number(parts.join(""));
    else if (parts[parts.length - 1].length === 2) value = Number(parts.slice(0, -1).join("") + "." + parts[parts.length - 1]);
    else return null;
    if (!Number.isFinite(value)) return null;
    return { value, prefix: (m[1] || "").trim(), raw: m[0] };
  };
  // Selector stabil yang hanya cocok dengan el ini (id > data-* > class).
  const uniqueSelector = (el) => {
    if (el.id) {
      const s = `#${CSS.escape(el.id)}`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
    const tag = el.tagName.toLowerCase();
    const datas = [...el.attributes].filter((a) => a.name.startsWith("data-"));
    for (const a of datas) {
      const s = `[${a.name}="${a.value}"]`;
      if (document.querySelectorAll(s).length === 1) return s;
      const s2 = `${tag}[${a.name}="${a.value}"]`;
      if (document.querySelectorAll(s2).length === 1) return s2;
    }
    const classes = [...el.classList];
    for (const c of classes) {
      const s = `.${CSS.escape(c)}`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
    for (const c of classes) {
      const s = `${tag}.${CSS.escape(c)}`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
    for (const a of datas) {
      for (const c of classes) {
        const s = `.${CSS.escape(c)}[${a.name}="${a.value}"]`;
        if (document.querySelectorAll(s).length === 1) return s;
      }
    }
    // Fallback: jangkar leluhur ber-id + rantai tag — untuk tombol/field
    // tanpa id/class/data (mis. <button type="submit"> polos di dalam
    // <form id="reservationForm"> → "#reservationForm button[type=\"submit\"]").
    // Tanpa jangkar id, tidak ada selector stabil → null (check tidak dibuat).
    let node = el;
    const parts = [];
    while (node && node !== document.documentElement) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
      const tag = node.tagName.toLowerCase();
      let seg = tag;
      const type = node.getAttribute && node.getAttribute("type");
      if (type) seg += `[type="${type}"]`;
      const parent = node.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter((s) => s.tagName === node.tagName);
        if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
      parts.unshift(seg);
      node = node.parentElement;
    }
    if (parts.length > 1 && parts[0].startsWith("#")) {
      const s = parts.join(" ");
      if (document.querySelectorAll(s).length === 1) return s;
    }
    return null;
  };
  // Elemen total keranjang: id/class cart+total/price yang teksnya uang.
  // Kontainer ditolak (ada anak yang juga memuat uang) — yang dipakai daun.
  const findCartTotal = () => {
    const seen = new Set();
    const consider = (el) => {
      if (!el || seen.has(el) || !visible(el)) return null;
      seen.add(el);
      const money = parseMoney(textOf(el));
      if (!money) return null;
      for (const ch of el.querySelectorAll("*")) {
        if (visible(ch) && parseMoney(directText(ch))) return null;
      }
      return { el, money };
    };
    for (const sel of ["#cart-total-display", "#cart-total", "#cartTotalPrice", "#cartTotal", "#cart-total-price", ".cart-total-display", ".cart-total-value", ".cart-total-price"]) {
      let hit = null;
      try { hit = consider(document.querySelector(sel)); } catch { /* selector tak valid */ }
      if (hit) return hit;
    }
    for (const el of document.querySelectorAll('[id*="cart" i], [class*="cart" i]')) {
      if (!/total|price|amount|subtotal/.test(`${el.id} ${el.className}`.toLowerCase())) continue;
      const hit = consider(el);
      if (hit) return hit;
    }
    return null;
  };
  // Tombol tambah pertama yang harganya bisa diverifikasi: harga dari
  // data-price (atau teks tombol), string harga tampil diambil dari teks
  // tombol sendiri atau dari elemen daun mana pun di halaman yang nilainya
  // sama + prefix-nya sama dengan total (string itu = total setelah 1 klik).
  const findAddButton = (total) => {
    const seen = new Set();
    const cands = [];
    for (const el of document.querySelectorAll(".btn-add-cart, [data-add], [data-price]")) {
      if (visible(el) && !seen.has(el)) { seen.add(el); cands.push(el); }
    }
    for (const el of document.querySelectorAll("button")) {
      if (seen.has(el) || !visible(el)) continue;
      const t = textOf(el);
      if (/tambah|add to cart|keranjang/i.test(t) && (el.hasAttribute("data-price") || parseMoney(t))) {
        seen.add(el); cands.push(el);
      }
    }
    for (const btn of cands) {
      const attr = btn.getAttribute("data-price");
      let price = attr !== null ? (parseMoney(attr)?.value ?? Number(attr)) : null;
      if (price === null || !Number.isFinite(price) || price <= 0) {
        const bm = parseMoney(textOf(btn));
        if (bm && bm.value > 0) price = bm.value;
        else continue;
      }
      let expected = null;
      const btnMoney = parseMoney(textOf(btn));
      if (btnMoney && btnMoney.value === price) expected = btnMoney.raw;
      if (!expected) {
        for (const el of document.querySelectorAll("body *")) {
          if (el === btn || !visible(el)) continue;
          let isContainer = false;
          for (const d of el.querySelectorAll("*")) {
            if (visible(d) && parseMoney(directText(d))) { isContainer = true; break; }
          }
          if (isContainer) continue;
          const m = parseMoney(directText(el));
          if (m && m.value === price && m.prefix === total.money.prefix) { expected = m.raw; break; }
        }
      }
      if (!expected) continue;
      const click = uniqueSelector(btn);
      const selector = uniqueSelector(total.el);
      if (!click || !selector) continue;
      return { el: btn, click, selector, expected };
    }
    return null;
  };
  const findFilter = () => {
    const btns = [...document.querySelectorAll("[data-filter]")].filter(visible);
    const cats = [...document.querySelectorAll("[data-category]")];
    if (btns.length === 0 || cats.length === 0) return null;
    const values = new Set(cats.map((c) => c.getAttribute("data-category")));
    const btn = btns.find((b) => {
      const v = b.getAttribute("data-filter");
      return v && v !== "all" && v !== "semua" && values.has(v);
    });
    if (!btn) return null;
    const val = btn.getAttribute("data-filter");
    if (cats.filter((c) => c.getAttribute("data-category") === val).length === 0) return null;
    if (cats.filter((c) => c.getAttribute("data-category") !== val).length === 0) return null;
    const clsCount = new Map();
    for (const c of cats) for (const cl of c.classList) clsCount.set(cl, (clsCount.get(cl) ?? 0) + 1);
    let common = null;
    for (const [cl, n] of clsCount) if (n === cats.length) { common = cl; break; }
    const sel = common
      ? `.${CSS.escape(common)}[data-category]:not([data-category="${CSS.escape(val)}"])`
      : `[data-category]:not([data-category="${CSS.escape(val)}"])`;
    if (document.querySelectorAll(sel).length === 0) return null;
    const click = uniqueSelector(btn);
    if (!click) return null;
    return { el: btn, click, selector: sel, val };
  };
  // Form dengan SATU error tersembunyi + novalidate (validasi JS, bukan
  // native — submit native tidak menampilkan error span). Input terkait
  // harus kosong, kalau tidak error itu belum tentu muncul saat submit.
  const findForm = () => {
    for (const form of document.querySelectorAll("form")) {
      if (!form.hasAttribute("novalidate")) continue;
      const errs = [...form.querySelectorAll('[class*="error" i], [id*="error" i]')].filter((el) => !visible(el));
      if (errs.length !== 1) continue;
      const err = errs[0];
      const group = err.closest("div, fieldset, label") ?? err.parentElement;
      const input = group ? group.querySelector("input, select, textarea") : null;
      if (input && String(input.value ?? "").trim() !== "") continue;
      const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (!submit || !visible(submit)) continue;
      const click = uniqueSelector(submit);
      const selector = uniqueSelector(err);
      if (!click || !selector) continue;
      return { el: submit, click, selector };
    }
    return null;
  };
  const findToggle = (used) => {
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme !== "light" && theme !== "dark") return null;
    const next = theme === "light" ? "dark" : "light";
    for (const el of document.querySelectorAll("button, [role='button']")) {
      if (!visible(el) || used.has(el)) continue;
      const hay = `${el.id} ${[...el.classList].join(" ")} ${el.getAttribute("aria-label") ?? ""} ${textOf(el)}`;
      if (/theme|mode|tema|dark|gelap|terang/i.test(hay)) {
        const click = uniqueSelector(el);
        if (!click) continue;
        return { el, click, expected: next };
      }
    }
    return null;
  };

  const initial = [];
  const actions = [];
  const derived = [];
  const usedClicks = new Set();
  const interactive = !!document.querySelector("button, input, select, textarea");
  const total = findCartTotal();
  if (total) {
    const sel = uniqueSelector(total.el);
    if (sel) {
      // Nol dalam format halaman itu sendiri ("¥12.000" prefill → "¥0").
      const zero = total.money.raw.replace(/[\d][\d.,]*/, "0");
      initial.push({ id: "cart-empty", label: "keranjang kosong saat dimuat", kind: "text-equals", selector: sel, expected: zero });
      derived.push("cart-empty");
    }
    const add = findAddButton(total);
    if (add) {
      actions.push({ id: "cart-add", label: `klik tambah → total ${add.expected} (tepat 1 item)`, kind: "click-then-text", click: add.click, selector: add.selector, expected: add.expected });
      derived.push("cart-add");
      usedClicks.add(add.el);
    }
  }
  const filter = findFilter();
  if (filter) {
    actions.push({ id: "filter", label: `filter '${filter.val}' → kartu kategori lain tersembunyi`, kind: "click-then-count", click: filter.click, selector: filter.selector, expected: 0 });
    derived.push("filter");
    usedClicks.add(filter.el);
  }
  const form = findForm();
  if (form) {
    actions.push({ id: "form-empty", label: "submit form kosong → pesan error muncul", kind: "click-then-count", click: form.click, selector: form.selector, expected: 1 });
    derived.push("form-empty");
    usedClicks.add(form.el);
  }
  const toggle = findToggle(usedClicks);
  if (toggle) {
    actions.push({ id: "theme-toggle", label: "toggle tema → data-theme berubah", kind: "click-then-attr", click: toggle.click, selector: "html", attr: "data-theme", expected: toggle.expected });
    derived.push("theme-toggle");
    usedClicks.add(toggle.el);
  }
  return { contract: { initial, actions }, derived, interactive };
}
/* eslint-enable no-undef */

/**
 * Turunkan kontrak default dari DOM live halaman yang sudah dibuka.
 * page: halaman CDP (punya .eval, pola measureInPage).
 * → {contract: {initial, actions}, derived: [id...], interactive: boolean}.
 */
export async function deriveDefaultContract(page) {
  const d = await page.eval(deriveDefaultContractInPage);
  if (!d || !d.contract) return { contract: { initial: [], actions: [] }, derived: [], interactive: false };
  return {
    contract: d.contract,
    derived: Array.isArray(d.derived) ? d.derived : [],
    interactive: !!d.interactive,
  };
}

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
 * Throw bila file tidak ada / JSON rusak / blok tidak ada — caller yang
 * memutuskan (bukan probe yang diam-diam jalan tanpa kontrak). v0.3.32:
 * pemanggil (measureAndGateWithBehavior) menangkap throw blok-hilang dan
 * lanjut ke kontrak default turunan DOM, BUKAN skip.
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
 * contract: kontrak eksplisit, atau null/undefined → kontrak default
 * diturunkan dari DOM live setelah navigasi (v0.3.32 §1).
 * → {checks: [{id, label, passed, actual?, detail?, error?}], pass,
 *    findings, source: "design" | "default" | "behavior.json" | <opts.source>,
 *    derived: [id...], interactive: boolean}.
 * Bila kontrak default menghasilkan 0 checks → findings berisi SATU warn
 * "tidak ada interaksi yang bisa diprobe" (pass tetap true — warn tidak
 * mengubah vonis), BUKAN skip diam-diam. Jalur eksplisit tidak berubah:
 * kontrak kosong eksplisit tetap {pass: true, findings: []}.
 * TIDAK PERNAH throw untuk kegagalan probe — gagal launch pun jadi satu
 * hasil probe-gagal (loop tetap jalan, gate yang memvonis).
 */
export async function probeBehavior(target, contract, opts = {}) {
  const explicit = contract !== null && contract !== undefined;
  const source = explicit ? (opts.source ?? "design") : "default";
  let checks = explicit ? normalizeContract(contract) : [];
  if (explicit && checks.length === 0) return { checks: [], pass: true, findings: [], source, derived: [], interactive: false };
  const chrome = resolveChromePath();
  if (!chrome) {
    const r = { id: "probe-launch", label: "probe browser", passed: false, error: "Chrome tidak ditemukan (set CHROME_PATH)" };
    return { checks: [r], pass: false, findings: evaluateBehavior([r]), source, derived: [], interactive: false };
  }
  let url = target, server = null;
  if (!/^https?:\/\//.test(target)) {
    if (!existsSync(resolve(target))) {
      const r = { id: "probe-launch", label: "probe browser", passed: false, error: `file tidak ada: ${target}` };
      return { checks: [r], pass: false, findings: evaluateBehavior([r]), source, derived: [], interactive: false };
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
      let derived = [], interactive = false;
      if (!explicit) {
        const d = await deriveDefaultContract(page).catch(() => null);
        if (d) {
          checks = normalizeContract(d.contract);
          derived = d.derived;
          interactive = d.interactive;
        }
      }
      if (checks.length === 0) {
        return {
          checks: [], pass: true,
          findings: [{ check: "behavior", severity: "warn", detail: NO_CHECKS_WARN_DETAIL }],
          source, derived, interactive,
        };
      }
      const results = [];
      for (const check of checks) results.push(await runCheck(page, check, opts));
      return { checks: results, pass: results.every((r) => r.passed), findings: evaluateBehavior(results), source, derived, interactive };
    } finally {
      await page.close();
    }
  } catch (e) {
    const r = { id: "probe-launch", label: "probe browser", passed: false, error: String(e?.message ?? e).slice(0, 160) };
    return { checks: [r], pass: false, findings: evaluateBehavior([r]), source, derived: [], interactive: false };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
}

/**
 * Probe + ukur + gate sekaligus (satu panggilan per iterasi loop):
 * probe behavior dulu, lalu measureAndGate dengan hasilnya.
 * Probe SELALU jalan (v0.3.32 §1): kontrak eksplisit (opts.behaviorContract)
 * > kontrak dari opts.designFile / opts.behaviorContractPath (blok hilang →
 * JANGAN jadi skip: catat contractNote dan lanjut ke derivasi default) >
 * kontrak default turunan DOM. Behavior findings ikut menentukan vonis
 * gate seperti v0.3.31; finding warn 0-check tidak mengubah vonis.
 * → {pass, findings, behavior, screenshots, input, behaviorSource,
 *    contractNote} — behaviorSource "design" | "default" | "behavior.json";
 *    contractNote null bila kontrak eksplisit dipakai.
 */
export async function measureAndGateWithBehavior(target, opts = {}) {
  let behavior = null;
  let behaviorSource = null;
  let contractNote = null;
  let extraFindings = [];
  if (opts.behaviorContract) {
    const probe = await probeBehavior(target, opts.behaviorContract, opts);
    behavior = probe.checks;
    behaviorSource = probe.source ?? opts.source ?? "design";
  } else {
    const designPath = opts.designFile ?? opts.behaviorContractPath ?? null;
    let explicit = null;
    if (designPath) {
      try {
        explicit = parseBehaviorContract(designPath);
      } catch (e) {
        const msg = String(e?.message ?? e);
        contractNote = msg.includes("tidak memuat blok")
          ? `kontrak eksplisit tidak ditemukan di ${designPath} — memakai kontrak default turunan DOM`
          : `gagal membaca kontrak eksplisit dari ${designPath} (${msg.slice(0, 120)}) — memakai kontrak default turunan DOM`;
      }
    }
    if (explicit) {
      const probe = await probeBehavior(target, explicit, { ...opts, source: /\.json$/i.test(designPath) ? "behavior.json" : "design" });
      behavior = probe.checks;
      behaviorSource = probe.source;
    } else {
      if (!designPath) contractNote = "tidak ada kontrak eksplisit — memakai kontrak default turunan DOM";
      const probe = await probeBehavior(target, null, opts);
      behavior = probe.checks;
      behaviorSource = probe.source ?? "default";
      if (probe.findings?.length) extraFindings = probe.findings;
    }
  }
  const gate = await measureAndGate(target, { ...opts, behavior });
  const findings = [...gate.findings, ...extraFindings.filter((f) => !gate.findings.some((g) => g.detail === f.detail))];
  findings.sort((a, b) => (a.check < b.check ? -1 : a.check > b.check ? 1 : a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
  return { ...gate, findings, behavior, behaviorSource, contractNote };
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
