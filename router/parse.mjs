/**
 * Satu parser untuk file config Lumitome: frontmatter (SKILL.md, agent) + JSONC (opencode.jsonc).
 * Dulu ada tiga parser frontmatter + dua stripJsonc dengan semantik beda — celahnya yang
 * bikin insiden v0.3.18 (fallback naif membaca `permissions:` sebagai string, bukan array).
 * Parser tunggal = yang sadar-YAML (satu-satunya dengan error reporting); fallback naif
 * harus terbukti setara di field yang dibaca — lihat tests/suite.mjs (paritas frontmatter).
 */
import { createRequire } from "node:module";

let YAML = null;
try { YAML = createRequire(import.meta.url)("yaml"); } catch { /* fallback naif di bawah */ }

const BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Parse frontmatter. Tanpa blok → null. YAML rusak → { __error }. */
export function frontmatter(text) {
  const m = BLOCK_RE.exec(text);
  if (!m) return null;
  if (YAML) {
    try { const v = YAML.parse(m[1]); return v && typeof v === "object" ? v : { __error: "bukan map" }; }
    catch (e) { return { __error: String(e.message).split("\n")[0] }; }
  }
  return parseNaiveBlock(m[1]);
}

/** Jalur naif yang dipaksa (tanpa paket yaml) — untuk tes paritas. Kontrak sama. */
export function frontmatterNaive(text) {
  const m = BLOCK_RE.exec(text);
  if (!m) return null;
  return parseNaiveBlock(m[1]);
}

/**
 * Parser baris + urutan blok. Untuk field yang dibaca pemanggil (name, description, mode,
 * swanwright_*, dan array-ness `permissions`), hasilnya sama dengan jalur YAML.
 * `permissions:` yang diikuti baris `- ...` dikumpulkan sebagai array string — cukup untuk
 * checkAgents yang hanya memeriksa Array.isArray.
 */
// YAML: kutip tunggal meloloskan ' sebagai ''; kutip ganda sebagai \". Parser naif lama
// hanya membuang kutip luar, jadi app''s lolos apa adanya — itu 38 beda di tes paritas.
const unquote = (v) => {
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1).replace(/''/g, "'");
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return v;
};
function parseNaiveBlock(block) {
  const fm = {};
  const lines = String(block).split(/\r?\n/);
  let key = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = /^([A-Za-z0-9_\-/]+):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      const val = unquote(kv[2]);
      if (val !== "") { fm[key] = val; continue; }
      // nilai kosong: urutan blok (`- ...`), map bersarang satu level (`metadata:`),
      // atau skalar terlipat (teks berindentasi). Hanya konstruksi ini yang ada di frontmatter repo.
      const items = [];
      const sub = {};
      let mode = null, folded = "";
      for (let j = i + 1; j < lines.length; j++) {
        const lj = lines[j];
        if (/^\s*$/.test(lj)) continue;
        const it = /^\s*-\s+(.*)$/.exec(lj);
        if (it) { if (mode && mode !== "list") break; mode = "list"; items.push(it[1].trim()); i = j; continue; }
        const skv = /^\s+([A-Za-z0-9_\-/]+):\s*(.*)$/.exec(lj);
        if (skv) { if (mode && mode !== "map") break; mode = "map"; sub[skv[1]] = unquote(skv[2]); i = j; continue; }
        if (/^\s+\S/.test(lj)) { if (mode && mode !== "fold") break; mode = "fold"; folded = folded ? folded + " " + lj.trim() : lj.trim(); i = j; continue; }
        break;
      }
      fm[key] = mode === "list" ? items : mode === "map" ? sub : mode === "fold" ? folded : "";
      continue;
    }
    if (key && /^\s+\S/.test(line) && typeof fm[key] === "string") fm[key] = (fm[key] + " " + line.trim()).trim();
  }
  for (const k of Object.keys(fm)) if (fm[k] === ">" || fm[k] === "|") fm[k] = "";
  return fm;
}

/** Buang komentar // dan block comment + koma trailing dari JSONC (string-aware). */
export function stripJsonc(s) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
