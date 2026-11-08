/**
 * Adapter renderer → input kanonik design-gate (v0.3.26).
 * Dua renderer, satu gate (§4.5 rencana): screenshot browser (via skill
 * design-taste-frontend: cdp.mjs + probe.mjs) dan export Figcraft.
 * ESM; satu-satunya dependensi luar adalah skill yang sudah ada — tidak ada
 * renderer baru yang dibangun.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve, join, dirname, extname, sep, relative, basename } from "node:path";
import { Browser, findChrome } from "../.opencode/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { probe } from "../.opencode/skills/design-taste-frontend/scripts/lib/probe.mjs";
import { STRESS_VIEWPORTS, contrastRatio, evaluateDesign } from "./design-gate.mjs";

/** Chrome puppeteer yang sudah ada di VM ini (fallback bila findChrome gagal). */
export const VM_CHROME_PATH = "/home/hatch/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome";

/** Path Chrome yang bisa dipakai, atau null. Set CHROME_PATH bila perlu. */
export function resolveChromePath() {
  const found = findChrome();
  if (found) return found;
  if (existsSync(VM_CHROME_PATH)) {
    process.env.CHROME_PATH = VM_CHROME_PATH;
    return VM_CHROME_PATH;
  }
  return null;
}

const HEIGHT = { 1440: 900, 1280: 800, 1024: 768, 768: 1024, 390: 844, 375: 812 };
const MIME = { ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf" };

// ---------- pengukuran di dalam halaman (self-contained, diserialisasi ke CDP) ----------
/* eslint-disable no-undef */
// Fungsi ini jalan DI DALAM browser — tidak boleh import / closure ke scope modul.
export function measureInPage() {
  const W = innerWidth;
  const parseRgb = (s) => {
    const m = String(s || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05;
  };
  // background efektif di belakang elemen (null bila ada gambar/gradien di belakangnya)
  const bgBehind = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage !== "none") return null;
      const v = parseRgb(cs.backgroundColor);
      if (v && v.a >= 0.9) return v.rgb;
    }
    return [255, 255, 255];
  };
  const texts = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (texts.length >= 500) break;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") continue;
    if (!visible(el)) continue;
    let direct = "";
    for (const n of el.childNodes) if (n.nodeType === 3) direct += n.nodeValue;
    direct = direct.replace(/\s+/g, " ").trim();
    if (!direct || el.closest("svg")) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (!size || size < 6) continue;
    const fg = parseRgb(cs.color);
    if (!fg || fg.a < 0.99) continue;
    const bg = bgBehind(el);
    if (!bg) continue;
    texts.push({ fg: fg.rgb, bg, size, weight: +cs.fontWeight || 400, where: `${tag.toLowerCase()}: ${direct.slice(0, 50)}` });
  }
  const taps = [];
  for (const el of document.querySelectorAll('button, a, input, [role="button"]')) {
    if (taps.length >= 300) break;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    taps.push({ width: Math.round(r.width), height: Math.round(r.height), label: (el.innerText || el.value || el.getAttribute("aria-label") || el.tagName).replace(/\s+/g, " ").trim().slice(0, 40) });
  }
  const images = [...document.images].map((i) => ({ src: (i.currentSrc || i.src).slice(0, 200), loaded: i.complete && i.naturalWidth > 0 }));
  const fonts = [...document.fonts].map((f) => ({ name: f.family, loaded: f.status === "loaded" }));
  // teks panjang: elemen yang overflow secara horizontal di dalam kotaknya sendiri
  let longText = null;
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible" || !visible(el)) continue;
    if (el.scrollWidth <= el.clientWidth + 2) continue;
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (t.length < 20) continue;
    longText = { overflow: true, clipped: true, truncated: cs.textOverflow === "ellipsis", where: `${el.tagName.toLowerCase()}: ${t.slice(0, 50)}` };
    break;
  }
  const states = {};
  for (const name of ["empty", "loading", "error"]) {
    const el = document.querySelector(`[data-state="${name}"]`);
    const rendered = !!el && visible(el) && (el.innerText || "").trim().length > 0;
    states[name] = { rendered, where: `data-state="${name}"` };
  }
  return {
    overflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    texts, taps, images, fonts, longText, states,
  };
}
/* eslint-enable no-undef */

// ---------- server file lokal (pola inspect.mjs) ----------
async function serveLocal(file) {
  const root = resolve(".");
  const f = resolve(file);
  const base = f.startsWith(root + sep) ? root : dirname(f);
  const server = createServer((req, res) => {
    try {
      let p = resolve(join(base, decodeURIComponent(new URL(req.url, "http://x").pathname)));
      if (p !== base && !p.startsWith(base + sep)) { res.writeHead(403); return res.end(); }
      if (statSync(p).isDirectory()) p = join(p, "index.html");
      res.writeHead(200, { "content-type": MIME[extname(p).toLowerCase()] || "application/octet-stream", "content-length": statSync(p).size, "cache-control": "no-store" });
      createReadStream(p).pipe(res);
    } catch { res.writeHead(404); res.end("not found"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}/${relative(base, f).split(sep).map(encodeURIComponent).join("/")}` };
}

const dedupe = (arr, key) => [...new Map(arr.map((x) => [key(x), x])).values()];

/**
 * Ukur halaman di browser sungguhan di tiap viewport stress-test.
 * target: URL http(s) atau path file .html lokal.
 * → {screenshots, contrast, tapTargets, viewports, assets, textCases}
 * (bentuk input evaluateDesign; screenshots = bukti render).
 */
export async function measurePage(target, { widths = STRESS_VIEWPORTS, outDir } = {}) {
  const chrome = resolveChromePath();
  if (!chrome) throw new Error("Chrome tidak ditemukan (set CHROME_PATH).");
  const dir = outDir ? resolve(outDir) : mkdtempSync(join(tmpdir(), "design-gate-"));
  mkdirSync(dir, { recursive: true });
  let url = target, server = null;
  if (!/^https?:\/\//.test(target)) {
    if (!existsSync(resolve(target))) throw new Error("No such file: " + target);
    ({ server, url } = await serveLocal(target));
  }
  const browser = await Browser.launch({
    // VM ini jalan sebagai root — Chrome menolak start tanpa --no-sandbox.
    extraArgs: typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : [],
  });
  const input = { screenshots: [], contrast: [], tapTargets: [], viewports: [], assets: { fonts: [], images: [] }, textCases: {} };
  try {
    for (const w of widths) {
      const h = HEIGHT[w] || Math.round(w * 0.625);
      const page = await browser.newPage({ width: w, height: h, dsf: 1, mobile: w < 600 });
      try {
        await page.goto(url, { timeoutMs: 30000, settleMs: 800 });
        await page.eval("document.fonts.ready.then(() => true)").catch(() => {});
        const shot = join(dir, `viewport-${w}.jpg`);
        await page.screenshot({ path: shot, quality: 82 });
        input.screenshots.push({ width: w, path: shot });
        const m = await page.eval(measureInPage);
        // probe() skill dipakai sebagai cross-check overflow + gambar rusak
        const p = await page.eval(probe).catch(() => null);
        const culprits = p?.page?.overflowCulprits ?? [];
        input.viewports.push({ width: w, scrollWidth: m.overflow.scrollWidth, clientWidth: m.overflow.clientWidth, culprits });
        for (const t of m.texts) {
          const kind = t.size >= 24 || (t.size >= 18.66 && t.weight >= 700) ? "large" : "text";
          // rasio dihitung di Node dengan contrastRatio gate (bukan di halaman)
          if (contrastRatio(t.fg, t.bg) !== null) input.contrast.push({ fg: t.fg, bg: t.bg, where: `${t.where} @${w}px`, kind });
        }
        input.tapTargets.push(...m.taps);
        input.assets.fonts.push(...m.fonts);
        input.assets.images.push(...m.images);
        if (m.longText && !input.textCases.longText) input.textCases.longText = m.longText;
        // state dicek sekali (DOM sama di semua viewport) — dari viewport pertama
        if (w === widths[0]) {
          input.textCases.emptyState = m.states.empty;
          input.textCases.loadingState = m.states.loading;
          input.textCases.errorState = m.states.error;
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }
  input.contrast = dedupe(input.contrast, (c) => `${c.fg}|${c.bg}|${c.kind}`);
  input.tapTargets = dedupe(input.tapTargets, (t) => `${t.label}|${t.width}x${t.height}`);
  input.assets.fonts = dedupe(input.assets.fonts, (f) => f.name);
  input.assets.images = dedupe(input.assets.images, (i) => i.src);
  return input;
}

/**
 * Petakan report.json inspect.mjs (design-taste-frontend) ke input gate.
 * Best-effort: lowContrast, horizontalOverflow, brokenImages, font fallback.
 */
export function fromInspectReport(report) {
  const input = { screenshots: [], contrast: [], viewports: [], assets: { fonts: [], images: [] } };
  const vps = Array.isArray(report?.viewports) ? report.viewports : [];
  for (const v of vps) {
    const m = v.metrics ?? {};
    const page = m.page ?? {};
    const w = v.width;
    if (typeof w === "number") {
      input.viewports.push({
        width: w,
        scrollWidth: w + (page.horizontalOverflow || 0),
        clientWidth: w,
        culprits: page.overflowCulprits ?? [],
      });
      if (v.images?.fold) input.screenshots.push({ width: w, path: v.images.fold });
      // report.images (top-level) juga membawa fold per viewport
      const im = (report.images ?? []).find((x) => x.width === w);
      if (im?.fold && !input.screenshots.some((s) => s.width === w)) input.screenshots.push({ width: w, path: im.fold });
    }
    for (const lc of m.color?.lowContrast ?? []) {
      input.contrast.push({ fg: lc.fg, bg: lc.bg, where: lc.text ?? "", kind: lc.need === 3 ? "large" : "text" });
    }
    for (const src of page.brokenImages ?? []) {
      input.assets.images.push({ src: String(src), loaded: false });
    }
    for (const name of m.type?.notLoaded ?? []) {
      input.assets.fonts.push({ name: String(name), loaded: false });
    }
  }
  input.contrast = dedupe(input.contrast, (c) => `${c.fg}|${c.bg}|${c.kind}`);
  input.assets.images = dedupe(input.assets.images, (i) => i.src);
  input.assets.fonts = dedupe(input.assets.fonts, (f) => f.name);
  return input;
}

/**
 * Baca direktori export Figcraft (PNG + metadata frame JSON bila ada) ke input gate.
 * Bisa diuji tanpa binary figcraft (pakai fixture): metadata sidecar
 * `design-gate.json` di direktori export membawa metrik terukur dalam bentuk
 * input gate (contrast/tapTargets/viewports/assets/textCases/consistency/
 * licenses); frame JSON (`frames.json` / `*.frames.json`) membawa daftar frame
 * {file, width, height}. Tanpa sidecar, hanya screenshot yang kembali.
 */
export function fromFigcraftExport(dir) {
  const d = resolve(dir);
  if (!existsSync(d) || !statSync(d).isDirectory()) throw new Error("Bukan direktori export: " + dir);
  const files = readdirSync(d);
  const input = { screenshots: [] };
  let frames = null, sidecar = null;
  for (const f of files) {
    if (!f.toLowerCase().endsWith(".json")) continue;
    try {
      const j = JSON.parse(readFileSync(join(d, f), "utf8"));
      if (Array.isArray(j.frames)) frames = j.frames;
      else if (Array.isArray(j)) frames = j;
      if (j && typeof j === "object" && (j.contrast || j.tapTargets || j.viewports || j.assets || j.textCases || j.consistency || j.licenses)) sidecar = j;
    } catch { /* JSON bukan metadata — abaikan */ }
  }
  const frameByFile = new Map((frames ?? []).map((fr) => [basename(String(fr.file ?? "")), fr]));
  for (const f of files) {
    if (!/\.png$/i.test(f)) continue;
    const fr = frameByFile.get(f);
    let width = fr?.width;
    if (width === undefined) {
      const m = f.match(/[-_](\d{3,4})(?:px|w)?\.png$/i);
      if (m) width = Number(m[1]);
    }
    const shot = { path: join(d, f) };
    if (Number.isFinite(width)) shot.width = width;
    input.screenshots.push(shot);
  }
  input.screenshots.sort((a, b) => (a.width ?? 0) - (b.width ?? 0) || (a.path < b.path ? -1 : 1));
  if (sidecar) {
    for (const k of ["contrast", "tapTargets", "viewports", "assets", "textCases", "consistency", "licenses"]) {
      if (sidecar[k] !== undefined) input[k] = sidecar[k];
    }
  }
  return input;
}

/** measurePage → evaluateDesign. → {pass, findings, screenshots, input}. */
export async function measureAndGate(target, opts = {}) {
  const input = await measurePage(target, opts);
  const gate = evaluateDesign(input);
  return { pass: gate.pass, findings: gate.findings, screenshots: input.screenshots, input };
}
