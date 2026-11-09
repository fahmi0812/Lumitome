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
import { STRESS_VIEWPORTS, contrastRatio, evaluateDesign, parseColor } from "./design-gate.mjs";

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
  // warna render untuk cek token-fidelity (§3.1 v0.3.28): computed styles
  // color/background/border dari elemen yang terlihat. Gradien dicatat
  // terpisah (backgroundImage) untuk cek anti-slop — stop warnanya diurus
  // di sana, bukan di sini. Bayangan (box-shadow) sengaja tidak dikumpulkan.
  const usedColors = [];
  const backgrounds = [];
  const gradientTexts = [];
  // heading (v0.3.29): level h1–h6 yang terlihat, dalam urutan DOM — untuk
  // cek skipped-heading. Yang tersembunyi tidak dihitung.
  const headings = [];
  // easing (v0.3.29): timing function hanya dicatat bila elemen BENAR-BENAR
  // punya transisi/animasi (duration > 0) dan nilainya bukan ease/linear
  // (keduanya tidak pernah bounce) — kalau tidak, computed value default
  // akan jadi noise.
  const easings = [];
  const addColor = (raw, where) => {
    const p = parseRgb(raw);
    if (!p) return;
    usedColors.push({ rgb: p.rgb, alpha: p.a, where });
  };
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
    texts.push({ fg: fg.rgb, bg, size, weight: +cs.fontWeight || 400, font: cs.fontFamily, where: `${tag.toLowerCase()}: ${direct.slice(0, 50)}` });
  }
  // warna + gradien dikumpulkan dari SEMUA elemen terlihat (bukan cuma teks),
  // supaya kartu/tombol/border ikut dicek token-fidelity-nya.
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const where = `${tag}: ${(el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 50)}`;
    addColor(cs.color, where);
    addColor(cs.backgroundColor, where);
    addColor(cs.borderTopColor, where);
    addColor(cs.borderRightColor, where);
    addColor(cs.borderBottomColor, where);
    addColor(cs.borderLeftColor, where);
    const bi = cs.backgroundImage;
    if (bi && bi !== "none" && /gradient\(/i.test(bi)) {
      backgrounds.push({ value: bi.slice(0, 500), where });
      // teks bergradien (§3.2 v0.3.28): background-clip text + gradien.
      // Dipisah dari loop teks di atas — teks ini color: transparent
      // (alpha 0) sehingga tidak masuk texts. backgroundClip ter-computed
      // adalah "text" baik ditulis background-clip maupun -webkit-.
      if ((cs.backgroundClip === "text" || cs.webkitBackgroundClip === "text") && (el.innerText || "").trim()) {
        gradientTexts.push({ where });
      }
    }
    const td = cs.transitionDuration || "";
    const tp = cs.transitionProperty || "";
    if (td !== "0s" && tp !== "none") {
      const ttf = cs.transitionTimingFunction || "";
      if (ttf && ttf !== "ease" && ttf !== "linear") easings.push({ value: ttf, where });
    }
    const an = cs.animationName || "";
    const ad = cs.animationDuration || "";
    if (an !== "none" && ad !== "0s") {
      const atf = cs.animationTimingFunction || "";
      if (atf && atf !== "ease" && atf !== "linear") easings.push({ value: atf, where });
    }
  }
  for (const el of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    if (headings.length >= 100) break;
    if (!visible(el)) continue;
    const level = Number(el.tagName[1]);
    headings.push({ level, where: `h${level}: ${(el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 50)}` });
  }
  const taps = [];
  for (const el of document.querySelectorAll('button, a, input, [role="button"]')) {
    if (taps.length >= 300) break;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    taps.push({ width: Math.round(r.width), height: Math.round(r.height), label: (el.innerText || el.value || el.getAttribute("aria-label") || el.tagName).replace(/\s+/g, " ").trim().slice(0, 40) });
  }
  // Variabel CSS (§2 v0.3.31): deklarasi --nama dari stylesheet same-origin
  // (style inline + <link> lokal) — supaya finding token-fidelity bisa
  // menyebut NAMA variabelnya, bukan cuma hex. Stylesheet cross-origin
  // (Google Fonts dsb.) dilempar try/catch dan dilewati — bukan error.
  // Nilai var(--lain) di-resolve satu tingkat dari peta yang sama.
  // SEMUA deklarasi dikumpulkan (bukan Map per nama): tema gelap + terang
  // bisa mendeklarasikan --nama yang sama dengan nilai beda (mis. Tokyo:
  // --border #252538 gelap vs #D0D2DE terang) — keduanya harus bisa dinamai.
  const cssVars = [];
  try {
    const rawVars = [];
    const byName = new Map();
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of rules) {
        const style = rule.style;
        if (!style) continue;
        for (let i = 0; i < style.length; i++) {
          const prop = style[i];
          if (prop && prop.startsWith("--")) {
            const value = style.getPropertyValue(prop).trim();
            rawVars.push({ name: prop, value });
            byName.set(prop, value);
          }
        }
      }
    }
    const resolveVar = (v, depth = 0) => {
      if (depth > 3) return v;
      const m = String(v).match(/^var\(\s*(--[a-zA-Z0-9-_]+)\s*(?:,.*)?\)$/);
      if (m && byName.has(m[1])) return resolveVar(byName.get(m[1]), depth + 1);
      return v;
    };
    for (const { name, value } of rawVars) cssVars.push({ name, value: resolveVar(value) });
  } catch { /* stylesheet tak terbaca — cssVars kosong, finding tanpa nama var */ }
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
    texts, taps, images, fonts, longText, states, usedColors, backgrounds, gradientTexts, headings, easings, cssVars,
  };
}
/* eslint-enable no-undef */

// ---------- server file lokal (pola inspect.mjs) ----------
// Diekspor untuk dipakai ulang probe behavior + pairwise (satu pola server,
// bukan tiga salinan).
export async function serveLocal(file) {
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

/** Magic bytes format gambar yang dikenali cek dua lapis (§4 v0.3.31). */
const IMAGE_MAGIC = [
  { test: (b) => b[0] === 0xff && b[1] === 0xd8, label: "JPEG" },
  { test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, label: "PNG" },
  { test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38, label: "GIF" },
  { test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, label: "WebP" },
  { test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && String.fromCharCode(...b.slice(8, 12)) === "avif", label: "AVIF" },
  { test: (b) => b[0] === 0x3c && b[1] === 0x73 && b[2] === 0x76 && b[3] === 0x67, label: "SVG" },
];

/**
 * Cek aset dua lapis (§4 v0.3.31): gambar yang gagal dimuat di browser dicek
 * HTTP-nya — status + content-type / magic bytes, timeout singkat, paralel.
 * → Map src → {ok, note}: ok bila status 200 DAN (content-type image/* ATAU
 * magic bytes gambar valid). Selain itu {ok: false, note: alasan}.
 * Hanya URL http(s) yang dicek; sisanya (data:, blob:, relatif) {ok:false}.
 * Timeout per URL 5 detik; gagal fetch (DNS, refused, timeout) = dead.
 */
export async function verifyImageUrls(urls, { timeoutMs = 5000 } = {}) {
  const out = new Map();
  const list = [...new Set((Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))];
  await Promise.all(list.map(async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Lumitome-design-gate/1.0" } });
      if (res.status !== 200) { out.set(url, { ok: false, note: `HTTP ${res.status}` }); return; }
      const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const buf = new Uint8Array(await res.arrayBuffer());
      const magic = IMAGE_MAGIC.find((m) => { try { return m.test(buf); } catch { return false; } });
      if (ct.startsWith("image/") || magic) {
        out.set(url, { ok: true, note: `200 + ${magic ? magic.label : ct || "byte gambar"} valid` });
      } else {
        out.set(url, { ok: false, note: `200 tapi bukan gambar (content-type: ${ct || "?"})` });
      }
    } catch (e) {
      out.set(url, { ok: false, note: String(e?.name === "TimeoutError" ? "timeout" : e?.message ?? e).slice(0, 80) });
    }
  }));
  return out;
}

/**
 * Ukur halaman di browser sungguhan di tiap viewport stress-test.
 * target: URL http(s) atau path file .html lokal.
 * → {screenshots, contrast, tapTargets, viewports, assets, textCases,
 *    usedColors, backgrounds, gradientTexts, texts, headings, easings}
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
  const input = { screenshots: [], contrast: [], tapTargets: [], viewports: [], assets: { fonts: [], images: [] }, textCases: {}, usedColors: [], backgrounds: [], gradientTexts: [], texts: [], headings: [], easings: [], cssVars: [] };
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
        input.usedColors.push(...(m.usedColors ?? []));
        input.backgrounds.push(...(m.backgrounds ?? []));
        input.gradientTexts.push(...(m.gradientTexts ?? []));
        // cssVars: deklarasi --nama halaman (mentah) → dinormalisasi di bawah
        // jadi {name, rgb} bila nilainya warna yang bisa diparse.
        input.cssVars.push(...(m.cssVars ?? []));
        // texts disimpan apa adanya (fg/bg/size/weight/font/where) untuk
        // cek anti-slop overused-font — didedupe per elemen (bukan per
        // viewport) supaya penyebut share-nya benar.
        input.texts.push(...(m.texts ?? []));
        // headings: urutan DOM dipertahankan (dedupe per level+where,
        // kemunculan pertama) supaya cek lompatan level benar.
        input.headings.push(...(m.headings ?? []));
        input.easings.push(...(m.easings ?? []));
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
  // Cek aset dua lapis (§4 v0.3.31): gambar yang gagal di browser dicek
  // HTTP-nya — 200 + byte gambar valid = BUKAN fail (verified "ok", gate
  // hanya warn). Yang mati/invalid tetap fail. Timeout singkat, paralel.
  const failed = input.assets.images.filter((i) => i.loaded === false && /^https?:\/\//i.test(i.src));
  if (failed.length > 0) {
    const verdicts = await verifyImageUrls(failed.map((i) => i.src));
    for (const img of failed) {
      const v = verdicts.get(img.src);
      if (v?.ok) { img.verified = "ok"; img.verifyNote = v.note; }
      else { img.verified = "dead"; img.verifyNote = v?.note ?? "tidak terjangkau"; }
    }
  }
  // cssVars: normalisasi nilai jadi rgb (parseColor gate) — yang bukan warna
  // (mis. "16px", "var() tak ter-resolve") dibuang; dedupe per nama+rgb.
  input.cssVars = dedupe(
    input.cssVars.map((v) => ({ name: v.name, rgb: parseColor(v.value) })).filter((v) => v.rgb),
    (v) => `${v.name}|${v.rgb.join(",")}`,
  );
  input.usedColors = dedupe(input.usedColors, (c) => `${c.rgb.join(",")}|${c.alpha}`);
  input.headings = dedupe(input.headings, (h) => `${h.level}|${h.where}`);
  input.easings = dedupe(input.easings, (e) => e.value);
  input.backgrounds = dedupe(input.backgrounds, (b) => b.value);
  input.gradientTexts = dedupe(input.gradientTexts, (g) => g.where);
  input.texts = dedupe(input.texts, (t) => `${t.where}|${t.font}`);
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
    for (const k of ["contrast", "tapTargets", "viewports", "assets", "textCases", "consistency", "licenses", "tokens", "usedColors", "backgrounds", "gradientTexts"]) {
      if (sidecar[k] !== undefined) input[k] = sidecar[k];
    }
  }
  return input;
}

/**
 * Baca DESIGN.md — source of truth arah + token (§3.1 v0.3.28).
 * Format yang dibaca Maker (lihat loopdesign §1):
 *   Arah: <nama arah estetika>
 *   Token: (daftar hex, satu per baris — atau di mana saja di file)
 *   Tipografi: <font display>, <font body>
 *   Signature: <elemen signature>
 *   Netral: (v0.3.31 §2 — warna netral WAJIB tint turunan token, bukan
 *     ciptaan sendiri; format per baris: `- --nama: tint #HEX <persen>%`
 *     atau `- --nama: #HEX (tint dari #HEX)`)
 * Token = SEMUA kode hex (#rrggbb/#rgb) yang ditemukan di file (dedupe,
 * huruf besar). Arah/tipografi/signature dibaca dari baris berlabel bila ada.
 * → {direction, tokens, typography, signature, fonts, tokenVars, neutrals}
 * (null bila tidak ada).
 * fonts = nama font (lowercase) dari baris Tipografi — "Fraunces (display),
 * Inter (body)" → ["fraunces", "inter"]; dipakai pengecualian overused-font.
 * tokenVars = peta nama variabel CSS → hex dari baris `--nama: #HEX` di mana
 * saja di file (mis. `- --text-muted: #A0A0B8`).
 * neutrals = [{name, base}] dari seksi Netral — var yang dideklarasikan
 * sebagai tint dari token (`base` = hex token induknya).
 */
export function parseDesignFile(path) {
  const raw = readFileSync(resolve(path), "utf8");
  const tokens = [...new Set([...raw.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map((m) => "#" + m[1].toUpperCase()))];
  const line = (re) => raw.match(re)?.[1]?.trim() || null;
  const typography = line(/^(?:Tipografi|Typography)\s*:\s*(.+)$/m);
  const fonts = typography
    ? typography.split(",").map((p) => p.split("(")[0].trim().replace(/^["']|["']$/g, "").toLowerCase()).filter(Boolean)
    : [];
  const tokenVars = {};
  for (const m of raw.matchAll(/(--[a-zA-Z0-9-_]+)\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g)) {
    tokenVars[m[1]] = m[2].toUpperCase();
  }
  const neutrals = [];
  // Baris `- --nama: tint #HEX ...` di mana saja di file = netral yang
  // dideklarasikan sebagai tint dari token (seksi Netral di DESIGN.md).
  for (const m of raw.matchAll(/^\s*-\s*(--[a-zA-Z0-9-_]+)\s*:\s*tint\s+(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/gm)) {
    neutrals.push({ name: m[1], base: m[2].toUpperCase() });
  }
  return {
    direction: line(/^(?:Arah|Direction)\s*:\s*(.+)$/m),
    tokens,
    typography,
    signature: line(/^Signature\s*:\s*(.+)$/m),
    fonts,
    tokenVars,
    neutrals,
  };
}

/**
 * measurePage → evaluateDesign. → {pass, findings, screenshots, input}.
 * opts.designFile: path DESIGN.md — token dibaca dari sana (fail bila file
 * tidak mendeklarasikan token hex sama sekali); opts.tokens: token langsung
 * (dipakai tes/red-test; menang atas designFile bila keduanya ada).
 * opts.declaredFonts: font yang dideklarasikan (menang atas designFile);
 * opts.allow: id aturan anti-slop yang dikecualikan bila brief meminta
 * eksplisit (mis. ["gradient-text"]).
 * opts.behavior: hasil probe behavior (array checks dari probeBehavior, atau
 * null) — digabung ke gate sebagai findings behavior/probe-gagal (§1 v0.3.31).
 * Untuk probe + ukur sekaligus pakai measureAndGateWithBehavior di
 * harness/design-behavior.mjs (probe butuh browser sendiri).
 */
export async function measureAndGate(target, opts = {}) {
  const input = await measurePage(target, opts);
  if (opts.tokens) {
    input.tokens = opts.tokens;
  } else if (opts.designFile) {
    const design = parseDesignFile(opts.designFile);
    if (design.tokens.length === 0) throw new Error(`DESIGN.md ${opts.designFile} tidak mendeklarasikan token hex`);
    input.tokens = design.tokens;
    input.design = design;
    input.declaredFonts = design.fonts;
  }
  if (opts.declaredFonts) input.declaredFonts = opts.declaredFonts;
  if (opts.allow) input.allow = opts.allow;
  if (opts.behavior) input.behavior = opts.behavior;
  const gate = evaluateDesign(input);
  return { pass: gate.pass, findings: gate.findings, screenshots: input.screenshots, input };
}
