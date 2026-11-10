/**
 * Lumitome design-gate — gate deterministik untuk hasil desain (v0.3.26;
 * token-fidelity + anti-slop v0.3.28).
 * Meniru pola done-gate (`harness/lumi-guard.mjs`): input render (screenshot PNG)
 * + metrik terhitung; output `{pass, findings[]}`. Pure, zero dependency, ESM.
 *
 * Yang diukur gate (deterministik, §4.1 rencana v0.3.26 + §3.1/§3.2 v0.3.28
 * + v0.3.31): viewport ekstrem, edge-case teks/data, aksesibilitas (kontras
 * WCAG AA, tap target), aset gagal muat (cek dua lapis: browser lalu HTTP),
 * konsistensi data, lisensi aset, kesetiaan token (warna render vs token
 * deklarasi DESIGN.md — finding menyebut variabel CSS + saran ganti),
 * anti-slop (pola slop yang bisa dihitung dari DOM/computed styles),
 * perilaku (probe interaksi terskrip dari kontrak Maker — behavior gate).
 * Yang TIDAK di gate: "terlihat bagus" / "terasa modern" — itu kerja kritikus.
 *
 * Fail-closed: warna yang tidak bisa diparse, lisensi yang tidak dikenal, dan
 * state yang tidak ter-render semuanya gagal — bukan lolos diam-diam.
 */

/** Viewport stress-test: desktop, tablet, HP sempit. */
export const STRESS_VIEWPORTS = [1440, 768, 390];
/** WCAG AA: rasio kontras minimum teks biasa. */
export const MIN_CONTRAST_TEXT = 4.5;
/** WCAG AA: rasio kontras minimum teks besar (≥24px, atau ≥18.66px tebal). */
export const MIN_CONTRAST_LARGE = 3;
/** WCAG AA: rasio kontras minimum elemen UI non-teks. */
export const MIN_CONTRAST_UI = 3;
/** Ukuran minimum target sentuh (px, sisi terpendek). */
export const MIN_TAP_TARGET = 44;

/** Lisensi aset yang dikenal — selain ini (atau kosong) = fail-closed. */
export const KNOWN_LICENSES = new Set(
  ["mit", "apache-2.0", "cc0", "cc-by", "cc-by-sa", "ofl", "owned", "proprietary-licensed"].map((s) => s.toLowerCase()),
);

// ---------- warna ----------

/**
 * Parse warna jadi [r, g, b] (0-255), atau null bila tidak dikenali.
 * Menerima '#rgb', '#rrggbb', 'rgb(r,g,b)', 'rgba(r,g,b,a)' (alpha diabaikan:
 * kontras dihitung terhadap warna efektif di belakangnya).
 */
export function parseColor(c) {
  if (Array.isArray(c) && c.length >= 3) {
    const [r, g, b] = c.map(Number);
    return [r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255) ? [r, g, b] : null;
  }
  if (typeof c !== "string") return null;
  const s = c.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)].map((h) => parseInt(h, 16));
  m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/);
  if (m) {
    const v = m.slice(1, 4).map(Number);
    return v.every((n) => n >= 0 && n <= 255) ? v : null;
  }
  return null;
}

/** Luminansi relatif WCAG (0-1) dari komponen RGB 0-255. */
export function relativeLuminance(r, g, b) {
  const f = (x) => {
    x /= 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Rasio kontras WCAG antara fg dan bg (array [r,g,b] atau string '#rrggbb').
 * Dibulatkan 2 desimal. Hitam di putih = 21.
 */
export function contrastRatio(fg, bg) {
  const a = parseColor(fg), b = parseColor(bg);
  if (!a || !b) return null;
  const l1 = relativeLuminance(...a), l2 = relativeLuminance(...b);
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
}

// ---------- cek per dimensi ----------

const finding = (check, severity, detail) => ({ check, severity, detail });

/**
 * Kontras teks/UI. pairs: [{fg, bg, where, kind: 'text'|'large'|'ui'}].
 * Fail bila ratio < ambang (text 4.5, large 3, ui 3); warn bila teks di [4.5, 7).
 */
export function evaluateContrast(pairs = []) {
  const out = [];
  for (const p of pairs) {
    const kind = p.kind === "large" ? "large" : p.kind === "ui" ? "ui" : "text";
    const need = kind === "text" ? MIN_CONTRAST_TEXT : kind === "large" ? MIN_CONTRAST_LARGE : MIN_CONTRAST_UI;
    const ratio = contrastRatio(p.fg, p.bg);
    const where = p.where ? ` di '${String(p.where).slice(0, 60)}'` : "";
    if (ratio === null) {
      out.push(finding("contrast", "fail", `warna tidak bisa diparse${where} (fg=${p.fg}, bg=${p.bg})`));
      continue;
    }
    if (ratio < need) {
      out.push(finding("contrast", "fail", `kontras ${kind} ${ratio}:1${where} butuh ≥${need}:1`));
    } else if (kind === "text" && ratio < 7) {
      out.push(finding("contrast", "warn", `kontras teks ${ratio}:1${where} lolos AA (≥4.5:1) tapi di bawah 7:1`));
    }
  }
  return out;
}

/** Tap target. targets: [{width, height, label}]; fail bila sisi terpendek < 44px. */
export function evaluateTapTargets(targets = []) {
  const out = [];
  for (const t of targets) {
    const w = Number(t.width), h = Number(t.height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) continue;
    if (Math.min(w, h) < MIN_TAP_TARGET) {
      out.push(finding("tap-target", "fail", `target sentuh '${String(t.label ?? "").slice(0, 40) || "(tanpa label)"}' ${w}×${h}px — sisi terpendek < ${MIN_TAP_TARGET}px`));
    }
  }
  return out;
}

/** Overflow horizontal. viewports: [{width, scrollWidth, clientWidth, culprits?}]. */
export function evaluateOverflow(viewports = []) {
  const out = [];
  for (const v of viewports) {
    const sw = Number(v.scrollWidth), cw = Number(v.clientWidth);
    if (!Number.isFinite(sw) || !Number.isFinite(cw)) continue;
    if (sw > cw + 2) {
      const culprits = Array.isArray(v.culprits) && v.culprits.length ? ` — pelakunya: ${v.culprits.slice(0, 3).join("; ")}` : "";
      out.push(finding("overflow", "fail", `overflow horizontal @${v.width ?? "?"}px: scrollWidth ${sw} > clientWidth ${cw} (+${sw - cw}px)${culprits}`));
    }
  }
  return out;
}

/** Aset gagal muat. assets: {fonts: [{name, loaded}], images: [{src, loaded, verified?, verifyNote?}]}.
 * Cek dua lapis (§4 v0.3.31): gambar yang gagal di browser dicek HTTP-nya
 * dulu (measurePage mengisi `verified`). verified === "ok" (200 + byte
 * gambar valid) = BUKAN fail — hanya warn "artefak lingkungan". Tanpa
 * verifikasi (atau verified === "dead") = fail seperti dulu. */
export function evaluateAssets(assets = {}) {
  const out = [];
  for (const f of assets.fonts ?? []) {
    if (f.loaded === false) out.push(finding("assets", "fail", `font '${f.name}' gagal dimuat (fallback)`));
  }
  for (const i of assets.images ?? []) {
    if (i.loaded === false) {
      if (i.verified === "ok") {
        out.push(finding("assets", "warn", `gambar '${String(i.src).slice(0, 100)}' gagal dimuat di browser tapi URL hidup (${i.verifyNote ?? "200 + byte gambar valid"}) — kemungkinan artefak lingkungan/offline, bukan fail`));
      } else {
        out.push(finding("assets", "fail", `gambar '${String(i.src).slice(0, 100)}' gagal dimuat`));
      }
    }
  }
  return out;
}

/**
 * Edge-case teks & state. cases:
 * { longText?: {overflow|clipped, truncated?, where},
 *   emptyState?: {rendered, where}, loadingState?: {rendered}, errorState?: {rendered} }.
 * Fail bila teks panjang overflow/clip tanpa truncate, atau state tidak ter-render.
 */
export function evaluateTextCases(cases = {}) {
  const out = [];
  const lt = cases.longText;
  if (lt && (lt.overflow || lt.clipped) && !lt.truncated) {
    out.push(finding("text-cases", "fail", `teks panjang ${lt.clipped ? "terpotong" : "overflow"} tanpa truncate${lt.where ? ` di '${String(lt.where).slice(0, 60)}'` : ""}`));
  }
  for (const [key, label] of [["emptyState", "empty"], ["loadingState", "loading"], ["errorState", "error"]]) {
    const st = cases[key];
    if (st && st.rendered === false) {
      out.push(finding("text-cases", "fail", `state ${label} tidak ter-render${st.where ? ` di '${String(st.where).slice(0, 60)}'` : ""}`));
    }
  }
  return out;
}

/** Konsistensi data. pairs: [{label, shown, expected}]; fail bila shown !== expected. */
export function checkConsistency(pairs = []) {
  const out = [];
  for (const p of pairs) {
    if (p.shown !== p.expected) {
      out.push(finding("consistency", "fail", `'${p.label}': tampil ${JSON.stringify(p.shown)}, seharusnya ${JSON.stringify(p.expected)}`));
    }
  }
  return out;
}

/**
 * Lisensi aset. assets: [{src, license}]; fail-closed — lisensi kosong atau
 * tidak dikenal gagal. Yang dikenal: MIT, Apache-2.0, CC0, CC-BY, CC-BY-SA,
 * OFL, 'owned', 'proprietary-licensed'.
 */
export function checkLicenses(assets = []) {
  const out = [];
  for (const a of assets) {
    const lic = String(a.license ?? "").trim().toLowerCase();
    if (!lic || !KNOWN_LICENSES.has(lic)) {
      out.push(finding("licenses", "fail", `aset '${String(a.src).slice(0, 100)}' lisensinya '${a.license ?? ""}' — kosong/tidak dikenal (fail-closed)`));
    }
  }
  return out;
}

/** [r,g,b] (0-255) → '#RRGGBB' (huruf besar). */
export function rgbToHex(rgb) {
  return "#" + rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** [r,g,b] (0-255) → {h: 0-360, s: 0-1, l: 0-1} (HSL). */
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

/**
 * Parse stop warna dari string gradien CSS (computed backgroundImage):
 * rgb()/rgba()/#hex → [{rgb, alpha}]. String lain diabaikan.
 */
export function parseGradientStops(value = "") {
  const out = [];
  const s = String(value);
  for (const m of s.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/g)) {
    out.push({ rgb: [+m[1], +m[2], +m[3]], alpha: m[4] === undefined ? 1 : +m[4] });
  }
  for (const m of s.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const rgb = parseColor("#" + m[1]);
    if (rgb) out.push({ rgb, alpha: 1 });
  }
  return out;
}

/**
 * Font yang paling sering dipakai generator AI (Impeccable `overused-font`:
 * Inter, Roboto, Fraunces, Geist, Plus Jakarta Sans, Space Grotesk).
 * Bukan larangan mutlak — yang dicek adalah dominasi TANPA deklarasi di
 * DESIGN.md (lihat checkAntiSlop).
 */
export const OVERUSED_FONTS = new Set(["inter", "roboto", "fraunces", "geist", "plus jakarta sans", "space grotesk"]);

/** Ambil nama family pertama dari string font-family CSS (lowercase). */
export function firstFontFamily(font = "") {
  return String(font).split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
}

/**
 * Anti-slop deterministik (§3.2 v0.3.28, dikoreksi v0.3.29) — subset kurasi
 * native, zero-dep. Sumber aturan (terverifikasi di repo sumber 2026-11-09):
 * Impeccable (pbakaus/impeccable, Apache-2.0, 62 aturan built-in = 31 slop +
 * 31 quality — 45 warning, 16 advisory, 1 error `script-error`; angka 61
 * adalah versi lama; terverifikasi di crates/foundation/src/registry.rs).
 * Telemetri Impeccable default ON HANYA untuk roll API (concept-seed /
 * new-work) — BUKAN untuk detector (crates/detect/ tidak punya referensi
 * telemetri). TIDAK dibundel — yang dipakai hanya ide aturan, diimplementasi
 * ulang native di sini.
 * ui-craft (educlopez/ui-craft, MIT) PUNYA registry 43 aturan anti-slop di
 * scripts/detect/rules.mjs (14 critical, 25 major, 2 warn, 2 minor; total
 * gate 52 = 43 anti-slop + 4 token + 5 a11y) dan UICraftScore deterministik
 * 0–100 offline zero-dep (evals/quality/score.mjs); tidak ada telemetri yang
 * ditemukan. Koreksi v0.3.29: klaim v0.3.28 bahwa "43 aturan tidak
 * terverifikasi" SALAH — registry-nya ada dan terverifikasi. Konsep
 * purple-gradient + gradient-text di bawah dikoroborasi KEDUA repo
 * (ui-craft `purple-cyan-gradient` critical, `gradient-text-metric` major).
 *
 * Aturan final (masing-masing punya tes merah + hijau):
 * - purple-gradient (Impeccable `ai-color-palette` + ui-craft
 *   `purple-cyan-gradient`): SATU gradien mengandung stop ungu/violet
 *   (hue 255–330) DAN stop cyan/biru (hue 170–255, saturasi > 0.15) —
 *   jendela ui-craft (dulu 240–300 + 170–200, dikoreksi v0.3.29 ke
 *   upstream). Aturan upstream memang AND; v0.3.29–v0.3.32 memakai OR
 *   (over-flag: gradien ungu murni / cyan murni ikut gagal), dikoreksi
 *   ke AND di v0.3.33 — konsekuensi: gradien ungu murni kini lolos.
 *   Lolos bila SEMUA stop-nya token deklarasi atau transparent — gradien
 *   dari palet brief adalah niat, bukan slop.
 * - repeating-gradient (Impeccable `repeating-stripes-gradient`): gradien
 *   berulang sebagai dekorasi permukaan.
 * - gradient-text (Impeccable `gradient-text` + ui-craft
 *   `gradient-text-metric`): teks dengan background-clip text + gradien
 *   (teks harus warna solid).
 * - overused-font (Impeccable `overused-font` + Anthropic frontend-design):
 *   >50% teks terukur memakai font overused sebagai family pertama DAN
 *   font itu tidak dideklarasikan di DESIGN.md (tipografi).
 * - skipped-heading (Impeccable `skipped-heading`, quality): level heading
 *   melompat >1 (mis. h1 lalu h3 tanpa h2). Heading pertama boleh level
 *   berapa saja — yang dicek hanya lompatan. (v0.3.29)
 * - bounce-easing (Impeccable `bounce-easing`, advisory): easing
 *   bounce/elastis (cubic-bezier dengan titik kontrol y di luar [0,1]).
 *   ADVISORY: severity `warn`, TIDAK PERNAH menggagalkan gate. (v0.3.29)
 *
 * Pengecualian (§6 rencana): bila brief MEMINTA eksplisit pola itu, caller
 * mengisi input.allow dengan id aturan (mis. ["gradient-text"]) — bukan
 * slop, jadi tidak dicek. Tanpa allow, aturan berlaku penuh.
 *
 * Yang sengaja TIDAK masuk subset (dengan alasan):
 * - transition-all (ui-craft, critical, source rule): MISFIRE pada halaman
 *   render — kedua file Kopi Senja memakai `transition: all
 *   var(--transition-base)` yang sah, dan utility `transition-all` Tailwind
 *   ada di mana-mana (termasuk stack shadcn yang kita rekomendasikan).
 *   Aturan source tidak berpindah ke gate halaman-render tanpa false
 *   positive. Ditolak v0.3.29.
 * - nested-cards: butuh heuristik "kartu" (border+radius+shadow bersarang)
 *   yang rawan false positive — butuh kalibrasi sendiri.
 * - cramped-padding / monotonous-spacing / flat-type-hierarchy: butuh
 *   geometri teks-vs-box dan statistik distribusi + ambang kalibrasi.
 * - marquee: prompt benchmark kita sendiri MEWAJIBKAN ticker berjalan —
 *   aturan ini akan false-fail pada brief yang sah.
 * - icon-tile-stack / hero-eyebrow-chip / kicker / oversized-h1: butuh
 *   heuristik geometri layout DOM, bukan warna/font yang bisa dihitung.
 * - tiny-text / undersized-ui-text: butuh ambang per-peran teks (label
 *   mikro vs body) yang belum dikalibrasi.
 * - codex-grid-background: butuh analisis background-size + layer gradien;
 *   repeating-gradient sudah menangkap pola gradien-berulang yang sejenis.
 *
 * input: {backgrounds?, gradientTexts?, texts?, tokens?, declaredFonts?,
 * headings?, easings?, allow?}. Field yang tidak ada = tidak dicek.
 */
export function checkAntiSlop(input = {}) {
  const out = [];
  const allow = new Set(Array.isArray(input.allow) ? input.allow : []);
  const tokens = (Array.isArray(input.tokens) ? input.tokens : []).map((t) => parseColor(t)).filter(Boolean);
  const isToken = (rgb) => tokens.some((t) => t[0] === rgb[0] && t[1] === rgb[1] && t[2] === rgb[2]);
  const backgrounds = Array.isArray(input.backgrounds) ? input.backgrounds : [];
  if (!allow.has("purple-gradient") || !allow.has("repeating-gradient")) {
    for (const b of backgrounds) {
      const value = String(b.value ?? "");
      if (!/gradient\(/i.test(value)) continue;
      const where = b.where ? ` di '${String(b.where).slice(0, 60)}'` : "";
      if (!allow.has("repeating-gradient") && /repeating-(linear|radial)-gradient\(/i.test(value)) {
        out.push(finding("anti-slop", "fail", `repeating-gradient: gradien berulang sebagai dekorasi permukaan${where} (Impeccable repeating-stripes-gradient)`));
        continue;
      }
      if (allow.has("purple-gradient")) continue;
      const stops = parseGradientStops(value);
      const offToken = stops.filter((s) => s.alpha > 0 && !isToken(s.rgb));
      if (offToken.length === 0) continue;
      // Aturan upstream ui-craft `purple-cyan-gradient` adalah AND (v0.3.33):
      // fail HANYA bila SATU gradien mengandung stop ungu (hue 255–330°)
      // DAN stop cyan/biru (hue 170–255°, saturasi > 0.15). Gradien ungu
      // murni atau cyan murni kini lolos — dulu OR (v0.3.29) menandainya.
      const isPurple = (s) => { const { h, s: sat } = rgbToHsl(s.rgb); return sat > 0.15 && h >= 255 && h <= 330; };
      const isCyan = (s) => { const { h, s: sat } = rgbToHsl(s.rgb); return sat > 0.15 && h >= 170 && h < 255; };
      const purple = offToken.find(isPurple);
      const cyan = offToken.find(isCyan);
      if (purple && cyan) {
        out.push(finding("anti-slop", "fail", `purple-gradient: gradien dengan stop ungu ${rgbToHex(purple.rgb)} (hue ${Math.round(rgbToHsl(purple.rgb).h)}°) + stop cyan/biru ${rgbToHex(cyan.rgb)} (hue ${Math.round(rgbToHsl(cyan.rgb).h)}°)${where} — bukan token deklarasi (Impeccable ai-color-palette)`));
      }
    }
  }
  if (!allow.has("gradient-text")) {
    for (const g of Array.isArray(input.gradientTexts) ? input.gradientTexts : []) {
      out.push(finding("anti-slop", "fail", `gradient-text: teks bergradien${g.where ? ` di '${String(g.where).slice(0, 60)}'` : ""} — teks harus warna solid (Impeccable gradient-text)`));
    }
  }
  if (!allow.has("overused-font")) {
    const declared = new Set((Array.isArray(input.declaredFonts) ? input.declaredFonts : []).map((f) => String(f).toLowerCase()));
    const texts = (Array.isArray(input.texts) ? input.texts : []).filter((t) => typeof t.font === "string" && t.font.trim() !== "");
    const overused = texts.filter((t) => OVERUSED_FONTS.has(firstFontFamily(t.font)) && !declared.has(firstFontFamily(t.font)));
    if (texts.length > 0 && overused.length / texts.length > 0.5) {
      const sample = [...new Set(overused.map((t) => firstFontFamily(t.font)))].join(", ");
      out.push(finding("anti-slop", "fail", `overused-font: ${overused.length}/${texts.length} teks memakai font overused (${sample}) tanpa deklarasi di DESIGN.md (Impeccable overused-font)`));
    }
  }
  // skipped-heading (v0.3.29, Impeccable `skipped-heading`): level heading
  // melompat >1 dari heading sebelumnya (mis. h1 lalu h3). Heading pertama
  // boleh level berapa saja — yang dicek hanya lompatan, supaya tidak ada
  // false positive pada halaman yang memang mulai dari h2.
  if (!allow.has("skipped-heading")) {
    const headings = (Array.isArray(input.headings) ? input.headings : []).filter((h) => Number.isInteger(h.level) && h.level >= 1 && h.level <= 6);
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1].level;
      const cur = headings[i].level;
      if (cur > prev + 1) {
        const where = headings[i].where ? ` di '${String(headings[i].where).slice(0, 60)}'` : "";
        out.push(finding("anti-slop", "fail", `skipped-heading: h${prev} lalu h${cur} tanpa h${prev + 1}${where} (Impeccable skipped-heading)`));
        break; // satu finding per halaman sudah cukup sebagai vonis
      }
    }
  }
  // bounce-easing (v0.3.29, Impeccable `bounce-easing`, ADVISORY): easing
  // bounce/elastis = cubic-bezier dengan titik kontrol y di luar [0,1]
  // (mis. cubic-bezier(0.68, -0.55, 0.27, 1.55)). Severity `warn` — memberi
  // tahu, TIDAK PERNAH menggagalkan gate (pass tidak terpengaruh).
  if (!allow.has("bounce-easing")) {
    const easings = Array.isArray(input.easings) ? input.easings : [];
    const seen = new Set();
    for (const e of easings) {
      const value = String(e.value ?? "");
      for (const m of value.matchAll(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g)) {
        const ys = [Number(m[2]), Number(m[4])];
        if (!ys.every(Number.isFinite)) continue;
        if (ys.some((y) => y < 0 || y > 1)) {
          const key = m[0];
          if (seen.has(key)) continue;
          seen.add(key);
          const where = e.where ? ` di '${String(e.where).slice(0, 60)}'` : "";
          out.push(finding("anti-slop", "warn", `bounce-easing: easing ${key}${where} — bounce/elastis terasa kuno, pakai ease-out-quart/quint/expo (Impeccable bounce-easing)`));
        }
      }
    }
  }
  return out;
}

/** Token deklarasi terdekat dari warna render (jarak Euclidean RGB) — saran
 * ganti untuk finding token-fidelity (§2 v0.3.31). tokens: [[r,g,b], ...]. */
export function nearestToken(rgb, tokens = []) {
  let best = null, bestD = Infinity;
  for (const t of tokens) {
    const d = (t[0] - rgb[0]) ** 2 + (t[1] - rgb[1]) ** 2 + (t[2] - rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

/** Nama variabel CSS (--nama) yang nilainya sama dengan warna render, bila
 * diketahui. cssVars: [{name, rgb}] dari measurePage (deklarasi :root /
 * stylesheet halaman). Satu warna bisa punya beberapa nama (tema gelap +
 * terang) — kembalikan semuanya, dipisah koma. */
export function variableNamesFor(rgb, cssVars = []) {
  const names = [];
  for (const v of Array.isArray(cssVars) ? cssVars : []) {
    const vrgb = Array.isArray(v.rgb) ? v.rgb : parseColor(v.value ?? v);
    if (vrgb && vrgb[0] === rgb[0] && vrgb[1] === rgb[1] && vrgb[2] === rgb[2]) {
      const name = String(v.name ?? "").trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/**
 * Kesetiaan token (§3.1 v0.3.28, bisa ditindaklanjuti §2 v0.3.31): setiap
 * warna render harus berasal dari token deklarasi (DESIGN.md — source of
 * truth).
 * tokens: ['#3E2723', ...] (nilai yang bisa diparse parseColor).
 * usedColors: [{rgb: [r,g,b], alpha: 0-1, where}] dari measurePage
 * (computed styles: color/background/border, dedupe).
 * opts.cssVars: [{name, rgb|value}] — deklarasi variabel CSS halaman, supaya
 * finding bisa menyebut NAMA variabelnya (mis. --text-muted), bukan cuma hex.
 *
 * Aturan turunan — eksplisit, masing-masing dites:
 * - solid (alpha >= 0.99): rgb harus sama persis dengan salah satu token.
 * - tint (0 < alpha < 0.99): diizinkan HANYA bila rgb-nya token (tint dari token).
 * - transparent (alpha === 0): diizinkan.
 * - warna render yang tidak bisa diparse: fail (fail-closed).
 * - token deklarasi yang tidak bisa diparse: fail (deklarasi rusak).
 *
 * Finding SELALU menyebut nama variabel (bila diketahui) + saran ganti:
 * token terdekat, atau tint dari token itu. Maker tidak perlu menebak —
 * finding-nya langsung bisa dikerjakan.
 *
 * Yang sengaja TIDAK dicek di sini: bayangan (box-shadow/text-shadow tidak
 * dikumpulkan measurePage, jadi tidak bisa false-fail) dan gradien
 * (stop warnanya diurus cek anti-slop, bukan cek ini).
 */
export function checkTokenFidelity(tokens = [], usedColors = [], opts = {}) {
  const out = [];
  if (!tokens || tokens.length === 0 || !usedColors || usedColors.length === 0) return out;
  const parsed = tokens.map((t) => ({ raw: t, rgb: parseColor(t) }));
  for (const p of parsed) {
    if (!p.rgb) out.push(finding("token-fidelity", "fail", `token deklarasi '${String(p.raw).slice(0, 40)}' tidak bisa diparse — perbaiki DESIGN.md`));
  }
  const valid = parsed.filter((p) => p.rgb).map((p) => p.rgb);
  if (valid.length === 0) return out;
  const isToken = (rgb) => valid.some((t) => t[0] === rgb[0] && t[1] === rgb[1] && t[2] === rgb[2]);
  const cssVars = opts.cssVars ?? [];
  const seen = new Set();
  for (const u of usedColors) {
    const rgb = Array.isArray(u.rgb) ? u.rgb : parseColor(u.color ?? u);
    const alpha = typeof u.alpha === "number" ? u.alpha : 1;
    if (!rgb || rgb.length < 3 || !rgb.slice(0, 3).every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
      out.push(finding("token-fidelity", "fail", `warna render tidak bisa diparse (${JSON.stringify(u).slice(0, 60)})`));
      continue;
    }
    const key = `${rgb.slice(0, 3).join(",")}|${alpha}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (alpha === 0) continue; // transparent
    if (isToken(rgb)) continue;
    const where = u.where ? ` di '${String(u.where).slice(0, 60)}'` : "";
    // Nama variabel (§2 v0.3.31): "--text-muted", atau "" bila tak diketahui.
    const names = variableNamesFor(rgb, cssVars);
    const varPart = names.length ? ` (variabel ${names.join(", ")})` : "";
    // Saran ganti: token terdekat (selalu ada — valid tidak kosong).
    const near = nearestToken(rgb, valid);
    const nearHex = near ? rgbToHex(near) : null;
    if (alpha < 0.99) {
      out.push(finding("token-fidelity", "fail", `tint rgba(${rgb.slice(0, 3).join(",")}, ${alpha})${varPart}${where} bukan dari token deklarasi — pakai tint dari token ${nearHex ? nearHex + " " : ""}(mis. rgba(${near ? near.join(", ") : ""}, ${alpha})) atau token ${nearHex ?? "terdekat"}`));
    } else {
      out.push(finding("token-fidelity", "fail", `warna solid ${rgbToHex(rgb)}${varPart}${where} bukan token deklarasi (token: ${tokens.join(", ")}) — ganti dengan token terdekat ${nearHex ?? "(tidak ada)"} atau tint dari token itu`));
    }
  }
  return out;
}

// ---------- stress-test & loop ----------

/**
 * Behavior gate (§1 v0.3.31) — hasil probe interaksi terskrip (dari
 * `harness/design-behavior.mjs`, atau ditulis langsung oleh caller).
 * results: [{id, label, passed, detail?, error?}].
 * - passed === false + error → finding check "probe-gagal" (probe-nya
 *   sendiri gagal jalan — timeout, elemen tak ditemukan, browser mati —
 *   BUKAN crash loop).
 * - passed === false tanpa error → finding check "behavior" (asersi
 *   kontrak dilanggar: keranjang terisi saat dimuat, klik tidak mengubah
 *   total, dsb.).
 * - passed === true → tidak ada finding.
 */
export function evaluateBehavior(results = []) {
  const out = [];
  for (const r of Array.isArray(results) ? results : []) {
    if (r.passed) continue;
    const label = String(r.label ?? r.id ?? "(tanpa label)").slice(0, 80);
    const detail = String(r.detail ?? r.actual ?? "").slice(0, 120);
    if (r.error) {
      out.push(finding("probe-gagal", "fail", `probe-gagal: '${label}' — ${String(r.error).slice(0, 160)}`));
    } else {
      out.push(finding("behavior", "fail", `'${label}'${detail ? ` — ${detail}` : ""}`));
    }
  }
  return out;
}

/**
 * Aturan berhenti saat mentok (§5 v0.3.31): jumlah findings tidak berkurang
 * 2 iterasi berturut-turut → loop berhenti dengan vonis "mentok di N
 * findings", bukan menghabiskan budget N.
 * counts: jumlah findings per iterasi, urut (mis. [45, 21, 21, 21]).
 * Stuck bila DUA transisi terakhir sama-sama tidak berkurang
 * (counts[-2] >= counts[-3] DAN counts[-1] >= counts[-2]).
 * → {stuck, findings, verdict} — verdict null bila belum mentok.
 */
export function checkStuck(counts = []) {
  const c = (Array.isArray(counts) ? counts : []).map(Number).filter(Number.isFinite);
  if (c.length < 3) return { stuck: false, findings: c.length ? c[c.length - 1] : null, verdict: null };
  const stuck = c[c.length - 2] >= c[c.length - 3] && c[c.length - 1] >= c[c.length - 2];
  const n = c[c.length - 1];
  return { stuck, findings: n, verdict: stuck ? `mentok di ${n} findings` : null };
}

/** Definisi edge-case yang harus diproduksi renderer sebelum dinilai gate. */
export function stressCases() {
  return [
    { id: "long-text", description: "Teks sangat panjang (tanpa spasi / 500+ karakter) di kartu sempit — harus truncate (ellipsis) atau pecah baris, bukan overflow/clip." },
    { id: "empty-state", description: "State data kosong (0 item) — harus ter-render dengan pesan kosong, bukan layar blank." },
    { id: "loading-state", description: "State loading — harus ter-render (skeleton/spinner), bukan konten kosong atau konten lama." },
    { id: "error-state", description: "State error (gagal muat) — harus ter-render dengan pesan error, bukan layar blank." },
  ];
}

/**
 * Satu titik penilaian: gabungkan semua cek jadi {pass, findings}.
 * input: {screenshots?, contrast?, tapTargets?, viewports?, assets?,
 * textCases?, consistency?, licenses?, tokens?, usedColors?, cssVars?,
 * backgrounds?, gradientTexts?, declaredFonts?, headings?, easings?,
 * allow?, behavior?}.
 * Field yang tidak ada = tidak dicek.
 * pass = tidak ada finding severity 'fail'. Findings terurut deterministik
 * berdasarkan nama check, lalu detail.
 */
export function evaluateDesign(input = {}) {
  const findings = [
    ...evaluateContrast(input.contrast),
    ...evaluateTapTargets(input.tapTargets),
    ...evaluateOverflow(input.viewports),
    ...evaluateAssets(input.assets),
    ...evaluateTextCases(input.textCases),
    ...checkConsistency(input.consistency),
    ...checkLicenses(input.licenses),
    ...checkTokenFidelity(input.tokens, input.usedColors, { cssVars: input.cssVars }),
    ...checkAntiSlop(input),
    ...evaluateBehavior(input.behavior),
  ];
  findings.sort((a, b) => (a.check < b.check ? -1 : a.check > b.check ? 1 : a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
  return { pass: !findings.some((f) => f.severity === "fail"), findings };
}

/**
 * Aturan berhenti loop (§4.2 rencana, + §5 v0.3.31 mentok): done bila gate
 * lolos; stop bila N habis ('n-habis'), tanpa perbaikan ('tanpa-perbaikan'),
 * mentok ('mentok' — findings tak berkurang 2 iterasi berturut-turut, vonis
 * "mentok di N findings"), atau 3 gagal berturut-turut ('anti-spin');
 * selain itu fix. `stuck` boleh boolean atau hasil checkStuck().
 */
export function nextLoopAction({ iteration = 1, maxIterations = 3, gatePass = false, improved = true, consecutiveFailures = 0, stuck = false } = {}) {
  if (gatePass) return { action: "done", reason: "gate-lolos" };
  const isStuck = stuck === true || (stuck && stuck.stuck === true);
  if (isStuck) {
    const n = stuck && typeof stuck.findings === "number" ? stuck.findings : null;
    return { action: "stop", reason: "mentok", verdict: n === null ? "mentok" : `mentok di ${n} findings` };
  }
  if (iteration >= maxIterations) return { action: "stop", reason: "n-habis" };
  if (consecutiveFailures >= 3) return { action: "stop", reason: "anti-spin" };
  if (!improved) return { action: "stop", reason: "tanpa-perbaikan" };
  return { action: "fix", reason: "perbaiki-dari-findings" };
}

/**
 * Input kritikus (§4.3 v0.3.26, §3.4 v0.3.28, §3 v0.3.31): screenshot +
 * hasil ukur gate + brief/token + hasil probe perilaku. Field apa pun yang
 * berbau kode/klaim (code, source, claims, prompt, dll) dibuang — kritikus
 * tidak pernah melihat kode atau klaim Maker.
 * Yang berubah di v0.3.31: `behavior` (hasil probe §1: checks lolos/gagal +
 * keadaan awal) IKUT dikirim, supaya kritikus bisa menyerang perilaku yang
 * rusak — sebelumnya kritikus hanya melihat screenshot, dan bug seperti
 * "keranjang terisi saat dimuat" tidak terlihat dari gambar diam.
 * Yang berubah di v0.3.32 (§2): `golden` (screenshot referensi + token +
 * brief referensi dari harness/design-golden.mjs) IKUT dikirim, supaya
 * kritikus bisa membandingkan iterasi saat ini vs golden. Golden
 * MENGINFORMASIKAN, NEVER-GATE — field ini tidak pernah dibaca
 * `evaluateDesign`, dan tidak ada vonis gagal yang berasal dari golden.
 */
export function criticInput({ screenshots, gate, brief, behavior, golden } = {}) {
  return { screenshots, findings: gate?.findings ?? [], pass: !!gate?.pass, brief: brief ?? null, behavior: behavior ?? null, golden: golden ?? null };
}
