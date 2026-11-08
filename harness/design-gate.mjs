/**
 * Lumitome design-gate — gate deterministik untuk hasil desain (v0.3.26).
 * Meniru pola done-gate (`harness/lumi-guard.mjs`): input render (screenshot PNG)
 * + metrik terhitung; output `{pass, findings[]}`. Pure, zero dependency, ESM.
 *
 * Yang diukur gate (deterministik, §4.1 rencana v0.3.26):
 * viewport ekstrem, edge-case teks/data, aksesibilitas (kontras WCAG AA,
 * tap target), aset gagal muat, konsistensi data, lisensi aset.
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

/** Aset gagal muat. assets: {fonts: [{name, loaded}], images: [{src, loaded}]}. */
export function evaluateAssets(assets = {}) {
  const out = [];
  for (const f of assets.fonts ?? []) {
    if (f.loaded === false) out.push(finding("assets", "fail", `font '${f.name}' gagal dimuat (fallback)`));
  }
  for (const i of assets.images ?? []) {
    if (i.loaded === false) out.push(finding("assets", "fail", `gambar '${String(i.src).slice(0, 100)}' gagal dimuat`));
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

// ---------- stress-test & loop ----------

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
 * textCases?, consistency?, licenses?}. Field yang tidak ada = tidak dicek.
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
  ];
  findings.sort((a, b) => (a.check < b.check ? -1 : a.check > b.check ? 1 : a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
  return { pass: !findings.some((f) => f.severity === "fail"), findings };
}

/**
 * Aturan berhenti loop (§4.2 rencana): done bila gate lolos; stop bila N habis
 * ('n-habis'), tanpa perbaikan ('tanpa-perbaikan'), atau 3 gagal berturut-turut
 * ('anti-spin'); selain itu fix.
 */
export function nextLoopAction({ iteration = 1, maxIterations = 3, gatePass = false, improved = true, consecutiveFailures = 0 } = {}) {
  if (gatePass) return { action: "done", reason: "gate-lolos" };
  if (iteration >= maxIterations) return { action: "stop", reason: "n-habis" };
  if (consecutiveFailures >= 3) return { action: "stop", reason: "anti-spin" };
  if (!improved) return { action: "stop", reason: "tanpa-perbaikan" };
  return { action: "fix", reason: "perbaiki-dari-findings" };
}

/**
 * Input kritikus (§4.3): HANYA screenshot + hasil ukur gate. Field apa pun yang
 * berbau kode/klaim (code, source, claims, prompt, dll) dibuang — kritikus
 * tidak pernah melihat kode atau klaim Maker.
 */
export function criticInput({ screenshots, gate } = {}) {
  return { screenshots, findings: gate?.findings ?? [], pass: !!gate?.pass };
}
