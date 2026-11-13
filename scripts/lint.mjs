#!/usr/bin/env node
/**
 * Lint gate Lumitome (v0.3.54 — lapis Static Analysis, Poteto Pyramid).
 *
 * Prinsip (Lauren Tan / poteto, "All Code Is Slop", 11 Nov 2026): setiap
 * koreksi manual diubah jadi aturan deterministik yang dicek mesin,
 * bukan ditambah ke prompt/skill. Gate ini murni non-interaktif —
 * jalan, cetak pelanggaran, exit 0/1. TIDAK ada prompt, TIDAK membaca
 * stdin, TIDAK menunggu input (syarat Fahmi: agent mode auto tidak
 * boleh diganggu pertanyaan).
 *
 * Keputusan implementasi: skrip kustom zero-dependency (Node built-in
 * saja), BUKAN ESLint. Alasan: (1) semua gate repo ini selama ini skrip
 * kustom (validate.mjs, scan.ts, release.mjs) — konsisten; (2) tanpa
 * dependency baru (runtime maupun dev) dan tanpa unduhan — jalan offline,
 * `validate --offline` tetap utuh; (3) cepat (pemindaian teks murni,
 * < 2 detik di repo ini); (4) deterministik — regex + pencocokan teks,
 * tanpa plugin yang bisa bergeser versinya.
 *
 * Aturan (semua berakar di koreksi nyata repo ini; tiap aturan HARUS
 * lolos di codebase saat ini — pelanggaran yang ada diperbaiki, bukan
 * dibiarkan merah):
 *   LINT-001 no-hardcoded-count — larangan `.length ===/!==` literal
 *     >= 10 di kode produksi (scripts/, lumitome/, harness/, router/).
 *     Pelajaran v0.3.47: `act.length !== 127` di validate mematahkan
 *     gate saat skill ke-128 datang. Hitungan kecil (0-9) = control
 *     flow, dibolehkan; ambang `<`/`>` dibolehkan; hitungan dinamis
 *     dibolehkan; tests/ dikecualikan (pin hitungan di sana sengaja).
 *   LINT-002 no-process-exit-in-lib — larangan `process.exit(` di
 *     lumitome/lib/ (modul library tidak boleh mematikan proses;
 *     hanya entry point boleh). Allowlist beralasan:
 *     - codemem-mcp-shim.mjs: shim proses MCP, meneruskan exit code
 *       child; file ini dijalankan sebagai proses.
 *     - provider-ui.mjs: menu TUI, keluar saat pengguna membatalkan.
 *   LINT-003 no-console-in-lib — larangan panggilan `console.*(`
 *     di lumitome/lib/ (output lewat stderr terstruktur / nilai
 *     balik, bukan console). `console.log` sebagai nilai (default
 *     param) dibolehkan; sebutan di komentar dibolehkan.
 *   LINT-004 layer-boundaries — (a) router/ tidak boleh mengimpor
 *     ke luar dirinya (`../`); router adalah lapisan query skill
 *     yang mandiri (ARCHITECTURE.md). (b) harness/lumi-guard.mjs
 *     hanya boleh mengimpor `node:*` — guard dimuat engine secara
 *     terisolasi dan fail-closed bila gagal dimuat.
 *
 * Keterbatasan yang dicatat jujur: pemeriksa teks ini memakai
 * stripComments yang sadar-string, tapi TIDAK memahami regex literal
 * secara penuh (pola `//` di dalam regex literal yang tidak di-escape
 * tidak mungkin ada di kode JS valid; pola `\/` yang di-escape
 * ditangani lewat guard backslash). Cek sintaks (`node --check`)
 * TIDAK masuk gate ini: diukur 56 file ≈ 6 detik (spawn tidak
 * paralel efektif di VM ini) — melebihi anggaran < 2 detik; sintaks
 * sudah ditangkap suite karena tiap file diimpor/dijalankan tes atau
 * validate. Bisa jadi LINT-005 bila ada pemeriksa in-process yang cepat.
 *
 * Pakai: `npm run lint` (diwire ke `npm run validate`, fail-closed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LINT_DIRS = ["scripts", "lumitome", "harness", "router"];

// --- Penghapus komentar yang sadar-string ---------------------------------
// Mengganti isi komentar dengan spasi (baris baru dipertahankan) supaya
// nomor baris tetap akurat. Menangani string ' "...", template literal
// (termasuk ${...}), komentar // dan /* */. Guard backslash mencegah
// `\/` di dalam regex literal dibaca sebagai awal komentar.
export function stripComments(src) {
  let out = "";
  const stack = [{ t: "code" }]; // code | sq | dq | tpl | expr | lc | bc
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1] ?? "";
    const top = stack[stack.length - 1];
    if (top.t === "lc") {
      if (c === "\n") { stack.pop(); out += c; } else out += " ";
      continue;
    }
    if (top.t === "bc") {
      if (c === "*" && n === "/") { stack.pop(); out += "  "; i++; }
      else out += (c === "\n" ? "\n" : " ");
      continue;
    }
    if (top.t === "sq" || top.t === "dq") {
      const q = top.t === "sq" ? "'" : '"';
      if (c === "\\") { out += c + (src[i + 1] ?? ""); i++; continue; }
      if (c === q) stack.pop();
      out += c;
      continue;
    }
    if (top.t === "tpl") {
      if (c === "\\") { out += c + (src[i + 1] ?? ""); i++; continue; }
      if (c === "`") { stack.pop(); out += c; continue; }
      if (c === "$" && n === "{") { stack.push({ t: "expr", depth: 0 }); out += "${"; i++; continue; }
      out += c;
      continue;
    }
    // code / expr
    if (c === "/" && n === "/" && src[i - 1] !== "\\") { stack.push({ t: "lc" }); out += "  "; i++; continue; }
    if (c === "/" && n === "*" && src[i - 1] !== "\\") { stack.push({ t: "bc" }); out += "  "; i++; continue; }
    if (c === "'") { stack.push({ t: "sq" }); out += c; continue; }
    if (c === '"') { stack.push({ t: "dq" }); out += c; continue; }
    if (c === "`") { stack.push({ t: "tpl" }); out += c; continue; }
    if (top.t === "expr") {
      if (c === "{") top.depth++;
      if (c === "}") {
        if (top.depth === 0) { stack.pop(); out += c; continue; }
        top.depth--;
      }
    }
    out += c;
  }
  return out;
}

// --- Aturan -----------------------------------------------------------------
const PROCESS_EXIT_ALLOW = {
  "lumitome/lib/codemem-mcp-shim.mjs": "shim proses MCP — meneruskan exit code child; file ini dijalankan sebagai proses",
  "lumitome/lib/provider-ui.mjs": "menu TUI — keluar saat pengguna membatalkan (abort)",
};

const inDirs = (rel, dirs) => dirs.some((d) => rel === d || rel.startsWith(d + "/"));

/** Lint satu file. Murni (tanpa I/O) — bisa diuji dengan sumber sintetis. */
export function lintSource(rel, src) {
  const violations = [];
  const push = (rule, line, message) => violations.push({ rule, file: rel, line, message });
  const code = stripComments(src);
  const lines = code.split("\n");
  const prod = inDirs(rel, LINT_DIRS);
  const inLib = rel.startsWith("lumitome/lib/");
  const inRouter = rel.startsWith("router/");
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (prod) {
      // LINT-001: .length ===/!== literal >= 10 (kedua arah)
      const m1 = line.match(/\.length\s*(?:===|!==)\s*(\d+)\b/)
        || line.match(/\b(\d+)\s*(?:===|!==)\s*[\w$]+(?:\.[\w$]+)*\.length\b/);
      if (m1 && Number(m1[1]) >= 10) {
        push("LINT-001", ln, `hitungan ${m1[1]} di-hardcode — hitung dinamis, jangan literal (pelajaran v0.3.47)`);
      }
    }
    if (inLib) {
      // LINT-002: process.exit di library
      if (/process\.exit\s*\(/.test(line) && !PROCESS_EXIT_ALLOW[rel]) {
        push("LINT-002", ln, "process.exit di lumitome/lib/ — hanya entry point (bin/, scripts/) dan allowlist beralasan yang boleh");
      }
      // LINT-003: panggilan console.* di library
      if (/console\.(?:log|error|warn|info|debug)\s*\(/.test(line)) {
        push("LINT-003", ln, "panggilan console.* di lumitome/lib/ — pakai stderr terstruktur / nilai balik");
      }
    }
    if (inRouter) {
      // LINT-004a: router tidak mengimpor ke luar dirinya
      if (/(?:from|import|require)\s*\(?\s*["']\.\.\//.test(line)) {
        push("LINT-004", ln, "router/ mengimpor ke luar dirinya (../) — router harus mandiri (ARCHITECTURE.md)");
      }
    }
    if (rel === "harness/lumi-guard.mjs") {
      // LINT-004b: guard hanya node:
      for (const m of line.matchAll(/(?:from\s+["']([^"']+)["']|import\s*\(?\s*["']([^"']+)["'])/g)) {
        const spec = m[1] ?? m[2];
        if (spec && !spec.startsWith("node:")) {
          push("LINT-004", ln, `guard mengimpor "${spec}" — harness/lumi-guard.mjs hanya boleh node:* (dimuat terisolasi, fail-closed)`);
        }
      }
    }
  });
  return violations;
}

export function collectFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(rel); }
      else if (/\.mjs$|\.ts$/.test(e.name)) out.push(rel.split(path.sep).join("/"));
    }
  };
  for (const d of LINT_DIRS) if (fs.existsSync(path.join(root, d))) walk(d);
  return out.sort();
}

/** Lint seluruh repo. Sinkron, tanpa I/O selain baca file, tanpa stdin. */
export function lintRepo(root = ".") {
  const t0 = Date.now();
  const files = collectFiles(root);
  const violations = [];
  for (const rel of files) {
    violations.push(...lintSource(rel, fs.readFileSync(path.join(root, rel), "utf8")));
  }
  return { violations, files: files.length, ms: Date.now() - t0 };
}

// --- CLI: node scripts/lint.mjs [--root <dir>] ------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const ri = process.argv.indexOf("--root");
  const root = ri >= 0 ? (process.argv[ri + 1] || ".") : ".";
  const r = lintRepo(root);
  for (const v of r.violations) console.log(`[lint] ${v.file}:${v.line} ${v.rule} ${v.message}`);
  if (r.violations.length) {
    console.error(`[lint] FAILED ${r.violations.length} pelanggaran (${r.files} file, ${r.ms} ms)`);
    process.exit(1);
  }
  console.log(`[lint] OK (${r.files} file, ${r.ms} ms)`);
}
