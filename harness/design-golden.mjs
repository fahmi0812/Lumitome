/**
 * Lumitome golden — kritik berjangkar referensi (v0.3.32 §2).
 * Golden = render referensi yang disediakan Maker/pengguna untuk keluarga
 * brief yang sama: file screenshot + DESIGN.md/token + ringkasan brief,
 * disimpan di workspace tugas (mis. `goldens/<nama>/`).
 *
 * DARI MANA GOLDEN BOLEH BERASAL — hanya dari referensi tepercaya:
 * desain yang sudah disetujui, screenshot referensi dari klien/brief,
 * atau render acuan yang dibuat/diambil di luar loop ini. Golden TIDAK
 * BOLEH digenerasi dari loop yang sama (output iterasi sebelumnya, atau
 * render yang dibuat loopdesign sendiri) — itu self-referential dan
 * tidak valid: loop akan menilai dirinya sendiri bagus.
 *
 * MENGINFORMASIKAN, NEVER-GATE — sama seperti pairwise critic v0.3.31
 * (harness/design-pairwise.mjs): divergensi vs golden hanya masuk
 * laporan kritikus sebagai temuan ADVISORY. Golden tidak pernah mengubah
 * vonis gate (`evaluateDesign` di harness/design-gate.mjs tidak membaca
 * golden sama sekali).
 *
 * BATASNYA — golden yang salah = patokan yang salah. Golden usang
 * (brief sudah berubah), golden dari keluarga brief yang berbeda, atau
 * golden yang screenshot-nya bukan render sebenarnya akan menyesatkan
 * kritikus sebaik apa pun niatnya. Golden TANPA screenshot atau tanpa
 * arah/token = tidak valid: `loadGolden` throw, bukan diam-diam lolos.
 *
 * Pure ESM, zero-dep (selain parseDesignFile dari design-measure).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseDesignFile } from "./design-measure.mjs";

/** Ekstensi screenshot yang diterima golden. */
export const GOLDEN_IMAGE_EXTS = [".png", ".jpg", ".jpeg"];

/** Normalisasi hex ke bentuk #RRGGBB (huruf besar) untuk perbandingan. */
export function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  const h = m[1];
  return "#" + (h.length === 3 ? [...h].map((c) => c + c).join("") : h).toUpperCase();
}

/** Semua hex (#rgb/#rrggbb) yang ditemukan di teks, dinormalisasi + dedupe. */
export function tokensFromText(text = "") {
  const out = [];
  for (const m of String(text).matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = normalizeHex("#" + m[1]);
    if (hex && !out.includes(hex)) out.push(hex);
  }
  return out;
}

/**
 * Baca direktori golden `goldens/<nama>/` → {name, screenshot, design,
 * brief, tokens, direction}.
 * Isi yang didukung:
 * - screenshot: file `.png`/`.jpg` — yang bernama `screenshot.*` diutamakan,
 *   kalau tidak ada, file gambar pertama (urut nama). WAJIB ada.
 * - `DESIGN.md`: dibaca dengan parseDesignFile (arah + token). Opsional
 *   bila ada brief.
 * - `brief.json`: JSON ringkasan brief {direction, tokens?, notes?}.
 *   `brief.md`: teks ringkasan (baris `Arah: ...` + hex di mana saja).
 *   Salah satu dari DESIGN.md / brief WAJIB ada.
 * - `direction` = arah brief (brief.json > baris Arah brief.md > DESIGN.md);
 *   `tokens` = gabungan token DESIGN.md + brief (dedupe).
 *
 * Throw dengan pesan jelas bila: direktori tidak ada/bukan direktori,
 * tidak ada screenshot, tidak ada DESIGN.md maupun brief, atau tidak ada
 * arah maupun token (golden tanpa arah/token = tidak valid).
 */
export function loadGolden(dir) {
  const root = resolve(dir);
  let st;
  try {
    st = statSync(root);
  } catch {
    throw new Error(`golden ${dir} tidak ada — sediakan direktori goldens/<nama>/ berisi screenshot + DESIGN.md/brief`);
  }
  if (!st.isDirectory()) throw new Error(`golden ${dir} bukan direktori — sediakan direktori goldens/<nama>/`);
  const name = basename(root);
  const files = readdirSync(root).sort();
  const images = files.filter((f) => GOLDEN_IMAGE_EXTS.includes(extname(f).toLowerCase()));
  if (images.length === 0) {
    throw new Error(`golden '${name}' tidak punya screenshot (.png/.jpg) — golden tanpa render referensi tidak valid`);
  }
  const shot = images.find((f) => /^screenshot\./i.test(f)) ?? images[0];
  const screenshot = join(root, shot);
  if (statSync(screenshot).size === 0) {
    throw new Error(`golden '${name}': screenshot '${shot}' kosong (0 byte)`);
  }
  const hasDesign = existsSync(join(root, "DESIGN.md"));
  const hasBriefJson = existsSync(join(root, "brief.json"));
  const hasBriefMd = existsSync(join(root, "brief.md"));
  if (!hasDesign && !hasBriefJson && !hasBriefMd) {
    throw new Error(`golden '${name}' tidak punya DESIGN.md maupun brief (brief.json/brief.md) — golden tanpa arah/token tidak valid`);
  }
  const design = hasDesign ? parseDesignFile(join(root, "DESIGN.md")) : null;
  let brief = null;
  if (hasBriefJson) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(root, "brief.json"), "utf8"));
    } catch (e) {
      throw new Error(`golden '${name}': brief.json tidak bisa diparse — ${e.message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`golden '${name}': brief.json harus objek {direction, tokens?, notes?}`);
    }
    brief = {
      direction: typeof parsed.direction === "string" && parsed.direction.trim() ? parsed.direction.trim() : null,
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens.map(normalizeHex).filter(Boolean) : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };
  } else if (hasBriefMd) {
    const raw = readFileSync(join(root, "brief.md"), "utf8");
    const direction = raw.match(/^(?:Arah|Direction)\s*:\s*(.+)$/m)?.[1]?.trim() || null;
    brief = { direction, tokens: tokensFromText(raw), notes: null, raw };
  }
  const direction = brief?.direction ?? design?.direction ?? null;
  const tokens = [...new Set([...(design?.tokens ?? []).map(normalizeHex).filter(Boolean), ...(brief?.tokens ?? [])])];
  if (!direction && tokens.length === 0) {
    throw new Error(`golden '${name}' tanpa arah maupun token — golden tidak valid (isi DESIGN.md/brief dengan Arah + Token)`);
  }
  return { name, screenshot, design, brief, tokens, direction };
}

/**
 * Divergensi deterministik desain saat ini vs golden — ADVISORY, bukan
 * findings gate. current: {tokens?, direction?, findings?} (dari DESIGN.md
 * + hasil gate); golden: hasil loadGolden (atau {tokens, direction}).
 * Yang diukur dari data yang ada:
 * - arah berbeda (direction mismatch, banding huruf kecil + trim),
 * - token di luar golden (token saat ini yang tidak ada di golden),
 * - token golden yang tidak dipakai (bila keduanya punya token),
 * - tidak ada token yang sama sekali (overlap 0, bila keduanya punya token).
 * Bila cocok (arah sama + token subset dari golden + semua token golden
 * dipakai) → []. Murni deterministik (tanpa model) supaya bisa dites.
 * Densitas/hierarki layout TIDAK bisa diukur dari token+arah saja — itu
 * kerja kritikus LLM yang melihat kedua screenshot berdampingan.
 */
export function goldenDivergence(current = {}, golden = {}) {
  const out = [];
  const curDir = typeof current.direction === "string" ? current.direction.trim() : null;
  const goldDir = typeof golden.direction === "string" ? golden.direction.trim() : null;
  if (curDir && goldDir && curDir.toLowerCase() !== goldDir.toLowerCase()) {
    out.push(`arah berbeda: saat ini '${curDir}' vs golden '${goldDir}'`);
  }
  const curTokens = [...new Set((Array.isArray(current.tokens) ? current.tokens : []).map(normalizeHex).filter(Boolean))];
  const goldTokens = [...new Set((Array.isArray(golden.tokens) ? golden.tokens : []).map(normalizeHex).filter(Boolean))];
  if (goldTokens.length === 0) {
    if (curTokens.length > 0) out.push("golden tidak mendeklarasikan token — divergensi token tidak bisa diukur");
    return out;
  }
  if (curTokens.length === 0) {
    out.push("tidak ada token desain saat ini untuk dibandingkan dengan golden");
    return out;
  }
  const outside = curTokens.filter((t) => !goldTokens.includes(t));
  if (outside.length > 0) {
    out.push(`token di luar golden: ${outside.slice(0, 5).join(", ")}${outside.length > 5 ? ` (+${outside.length - 5} lagi)` : ""}`);
  }
  const missing = goldTokens.filter((t) => !curTokens.includes(t));
  if (missing.length > 0) {
    out.push(`token golden tidak dipakai: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5} lagi)` : ""}`);
  }
  if (outside.length === curTokens.length && missing.length === goldTokens.length) {
    out.push("tidak ada token yang sama dengan golden");
  }
  return out;
}
