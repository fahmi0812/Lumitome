/**
 * Snapshot situs live → HTML statis + screenshot (v0.3.36 §5).
 * Diadaptasi dari unslop scripts/snapshot.mjs (CC BY 4.0, Damir Sokolovsky,
 * https://github.com/heydamir/unslop) — zero-dep, pakai CDP Browser yang
 * sudah ada (BUKAN Playwright).
 *
 * node harness/design-snapshot.mjs <url|file> <out.html> [--dark|--light] [--width 1440] [--height 810]
 * - target: URL http(s) atau path file .html lokal (disajikan via serveLocal).
 * - scroll dulu agar lazy-load ketangkap, lalu simpan HTML (script dihapus,
 *   URL relatif dijadikan absolut, src gambar = currentSrc) + screenshot
 *   `<out>.live.png` (PNG).
 * - Caveat (sama seperti unslop): background animasi dari script tidak
 *   selamat — hasil snapshot adalah salinan statis.
 *
 * URL tak valid / Chrome tak ada → error bersih (tanpa stack trace).
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Browser } from "../.opencode/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { resolveChromePath, serveLocal } from "./design-measure.mjs";

export const USAGE = "usage: node harness/design-snapshot.mjs <url|file> <out.html> [--dark|--light] [--width 1440] [--height 810]";

/** Parse argv → {target, out, width, height, scheme}; throw Error bila tidak valid. */
export function parseSnapshotArgs(argv = []) {
  const positionals = [];
  let width = 1440, height = 810, scheme = "no-preference";
  const size = (name, value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} harus bilangan bulat > 0, dapat "${value}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = /^--(width|height)(?:=(.*))?$/.exec(a);
    if (m) {
      const v = m[2] ?? argv[++i];
      if (v === undefined || String(v).startsWith("--")) throw new Error(`--${m[1]} butuh nilai, mis. --${m[1]} 1440`);
      if (m[1] === "width") width = size("width", v);
      else height = size("height", v);
    } else if (a === "--dark") scheme = "dark";
    else if (a === "--light") scheme = "light";
    else if (a.startsWith("--")) throw new Error(`flag tak dikenal: ${a}`);
    else positionals.push(a);
  }
  const [target, out] = positionals;
  if (!target || !out || positionals.length > 2) throw new Error(USAGE);
  return { target, out, width, height, scheme };
}

// ---------- fungsi yang jalan DI DALAM browser (self-contained) ----------
/* eslint-disable no-undef */
// Scroll langkah demi langkah supaya lazy-load ketangkap, lalu tunggu
// gambar yang masih pending (maks 5 detik), kembali ke atas.
async function scrollToLoad() {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  const root = document.scrollingElement || document.documentElement;
  let last = root.scrollHeight;
  for (let step = 0; step < 30 && root.scrollTop < 20000; step++) {
    window.scrollBy(0, window.innerHeight);
    await pause(150);
    const grown = root.scrollHeight;
    if (grown <= last && root.scrollTop + window.innerHeight >= grown) break;
    last = grown;
  }
  window.scrollTo(0, 0);
  const pending = [...document.images].filter((img) => !img.complete);
  await Promise.race([Promise.all(pending.map((img) => new Promise((done) => {
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }))), pause(5000)]);
}
// Serialisasi halaman jadi HTML statis: script/noscript dibuang, src gambar
// dibekukan ke currentSrc, URL relatif dijadikan absolut.
function serializePage() {
  const abs = (v) => { try { return new URL(v, location.href).href; } catch { return v; } };
  const copy = document.documentElement.cloneNode(true);
  const liveImgs = document.querySelectorAll("img");
  copy.querySelectorAll("img").forEach((node, i) => {
    const sel = liveImgs[i] && liveImgs[i].currentSrc;
    if (sel) node.setAttribute("src", sel);
  });
  copy.querySelectorAll("script, noscript").forEach((n) => n.remove());
  copy.querySelectorAll("[srcset]").forEach((n) => n.removeAttribute("srcset"));
  copy.querySelectorAll("source").forEach((n) => n.remove());
  for (const n of copy.querySelectorAll("[src]")) { const v = n.getAttribute("src"); if (v) n.setAttribute("src", abs(v)); }
  for (const n of copy.querySelectorAll("link[href]")) { const v = n.getAttribute("href"); if (v) n.setAttribute("href", abs(v)); }
  for (const n of copy.querySelectorAll("a[href]")) { const v = n.getAttribute("href"); if (v) n.setAttribute("href", abs(v)); }
  return "<!doctype html>\n" + copy.outerHTML;
}
/* eslint-enable no-undef */

/**
 * Snapshot target → {html, png} (path absolut). target: URL http(s) atau
 * path file lokal. Throw Error bersih bila target tak valid / Chrome tak
 * ada / halaman tak bisa dimuat.
 */
export async function snapshot(target, out, { width = 1440, height = 810, scheme = "no-preference" } = {}) {
  const outAbs = resolve(out);
  const png = outAbs.replace(/\.html?$/, "") + ".live.png";
  let url = target, server = null;
  if (/^https?:\/\//i.test(target)) {
    url = target;
  } else if (existsSync(resolve(target)) && statSync(resolve(target)).isFile()) {
    ({ server, url } = await serveLocal(target));
  } else {
    throw new Error(`target tidak ditemukan atau bukan URL http(s): ${target}`);
  }
  if (!resolveChromePath()) throw new Error("Chrome tidak ditemukan (set CHROME_PATH).");
  const browser = await Browser.launch({
    extraArgs: typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : [],
  });
  try {
    const page = await browser.newPage({ width, height, dsf: 1 });
    try {
      if (scheme === "dark" || scheme === "light") {
        await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
      }
      await page.goto(url, { timeoutMs: 30000, settleMs: 800 }).catch((e) => { throw new Error(`tidak bisa memuat ${target}: ${e.message}`); });
      await page.eval("document.fonts.ready.then(() => true)").catch(() => {});
      await page.eval(scrollToLoad);
      const html = await page.eval(serializePage);
      mkdirSync(dirname(outAbs), { recursive: true });
      writeFileSync(outAbs, html);
      await page.eval(() => window.scrollTo(0, 0));
      await page.screenshot({ path: png, format: "png" });
      return { html: outAbs, png };
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }
}

// ---------- CLI ----------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let args;
  try {
    args = parseSnapshotArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`snapshot: ${e.message}`);
    console.error(USAGE);
    process.exit(2);
  }
  snapshot(args.target, args.out, args)
    .then(({ html, png }) => console.log(`saved ${html}\nshot ${png}`))
    .catch((e) => { console.error(`snapshot: ${e.message}`); process.exit(1); });
}
