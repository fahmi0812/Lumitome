/**
 * Konsultasi modern-web-guidance (GoogleChrome) untuk Maker loopdesign /
 * stitch-ui (v0.3.55, R1) — SATU titik wiring runtime, tanpa impor file.
 *
 * Alur MWG (search → retrieve → verify → disclose): modul ini hanya
 * menjalankan langkah 1–2 (search/retrieve) lewat CLI resmi
 * `npx -y modern-web-guidance@latest ...` — persis, tidak pernah npx
 * telanjang (tanpa -y npx bisa bertanya "install?" — dilarang Fahmi).
 * Verify (langkah 3) dan disclose (langkah 4) dilakukan Maker di
 * DESIGN.md/design.md, bukan di sini.
 *
 * Fallback offline: CLI gagal (tanpa jaringan, npx tidak ada, timeout,
 * id tidak ada) = { ok:false, source:"fallback" } — BUKAN error. Loop
 * lanjut tanpa MWG; jangan pernah gagalkan loop karena MWG tidak ada.
 *
 * Murni non-interaktif: spawnSync dengan stdin tertutup (input: "") dan
 * `-y`; tidak membaca stdin, tidak menunggu input, tidak bertanya.
 * Override bin hanya untuk tes: env LUMI_MWG_BIN (atau opsi bin).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MWG_PACKAGE = "modern-web-guidance@latest";
export const MWG_TOP_GUIDES = 3;
export const MWG_TIMEOUT_MS = 120000;

/** Argv persis — [npx, -y, modern-web-guidance@latest, cmd, ...args]. */
export function mwgArgv(command, args = []) {
  return ["npx", "-y", MWG_PACKAGE, command, ...args];
}

/** Parse output JSON `search` -> [{ id, description }]. Lempar bila bukan array. */
export function parseSearchJson(text) {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error("mwg: output search bukan array JSON");
  return arr
    .filter((g) => g && typeof g.id === "string")
    .map((g) => ({ id: g.id, description: typeof g.description === "string" ? g.description : "" }));
}

/** Ambil path file panduan dari baris pointer `retrieve` (null bila tidak ada). */
export function parseRetrievePointer(text) {
  const m = String(text).match(/saved to (\S+) to prevent CLI stdout truncation/);
  return m ? m[1] : null;
}

function runMwg(argv, { bin, timeoutMs }) {
  try {
    return spawnSync(bin, argv.slice(1), { timeout: timeoutMs, input: "", encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  } catch (e) {
    return { status: null, stdout: "", stderr: String(e?.message ?? e), error: e };
  }
}

const fallback = (reason) => ({ ok: false, consulted: false, source: "fallback", reason });

function failWhy(r) {
  if (!r.error) return `exit ${r.status}`;
  if (r.error.code === "ETIMEDOUT") return "timeout";
  return `gagal menjalankan (${r.error.code || "error"})`;
}

/** Langkah 1 MWG: search -> { ok, results } atau fallback { ok:false, results:[] }. */
export function searchMwq({ query, bin, timeoutMs = MWG_TIMEOUT_MS } = {}) {
  const b = bin || process.env.LUMI_MWG_BIN || "npx";
  if (!query || !String(query).trim()) return { ...fallback("tanpa query"), results: [] };
  const r = runMwg(mwgArgv("search", [String(query).trim()]), { bin: b, timeoutMs });
  if (r.error || r.status !== 0) return { ...fallback(`search gagal (${failWhy(r)})`), results: [] };
  let results;
  try { results = parseSearchJson(r.stdout); } catch { return { ...fallback("search: output bukan JSON"), results: [] }; }
  if (!results.length) return { ...fallback("search: tidak ada panduan"), results: [] };
  return { ok: true, results };
}

/** Langkah 2 MWG: retrieve ids -> { ok, guides:[{id, file, bytes}] } atau fallback. */
export function retrieveMwq({ ids, bin, timeoutMs = MWG_TIMEOUT_MS } = {}) {
  const b = bin || process.env.LUMI_MWG_BIN || "npx";
  const list = (Array.isArray(ids) ? ids : [ids])
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim());
  if (!list.length) return { ...fallback("tanpa id panduan"), guides: [] };
  const r = runMwg(mwgArgv("retrieve", [list.join(",")]), { bin: b, timeoutMs });
  if (r.error || r.status !== 0) return { ...fallback(`retrieve gagal (${failWhy(r)})`), guides: [] };
  const file = parseRetrievePointer(r.stdout);
  if (!file) return { ...fallback("retrieve: tidak ada file panduan"), guides: [] };
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return { ...fallback("file panduan tidak terbaca"), guides: [] }; }
  return { ok: true, guides: list.map((id) => ({ id, file, bytes: size })) };
}

/** Search + retrieve (maks top panduan) -> { ok, consulted, source, query, guides } atau fallback. */
export function consult({ query, ids, top = MWG_TOP_GUIDES, bin, timeoutMs = MWG_TIMEOUT_MS } = {}) {
  if (ids) {
    const r = retrieveMwq({ ids, bin, timeoutMs });
    if (!r.ok) return { ok: false, consulted: false, source: "fallback", reason: r.reason, query: query ?? null, guides: [] };
    return { ok: true, consulted: true, source: "cli", query: query ?? null, guides: r.guides };
  }
  const s = searchMwq({ query, bin, timeoutMs });
  if (!s.ok) return { ok: false, consulted: false, source: "fallback", reason: s.reason, query: query ?? null, guides: [] };
  const wanted = s.results.slice(0, top).map((g) => g.id);
  const r = retrieveMwq({ ids: wanted, bin, timeoutMs });
  if (!r.ok) return { ok: false, consulted: false, source: "fallback", reason: r.reason, query: query ?? null, guides: [] };
  return { ok: true, consulted: true, source: "cli", query, guides: r.guides };
}

// --- CLI: node harness/mwg-consult.mjs <search|retrieve|consult> ... -------
// Cetak JSON ke stdout; exit 0 selalu kecuali usage salah (exit 2).
// Fallback BUKAN error — exit 0 dengan { ok:false, source:"fallback" }.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const usage = () => process.stderr.write("pakai: node harness/mwg-consult.mjs <search \"<query>\"|retrieve <id[,id...]>|consult \"<query>\">\n");
  let out = null;
  if (cmd === "search" && rest[0]) {
    const s = searchMwq({ query: rest[0] });
    out = s.ok ? { ok: true, consulted: true, source: "cli", results: s.results }
      : { ok: false, consulted: false, source: "fallback", reason: s.reason, results: [] };
  } else if (cmd === "retrieve" && rest[0]) {
    const r = retrieveMwq({ ids: rest[0].split(",") });
    out = r.ok ? { ok: true, consulted: true, source: "cli", guides: r.guides }
      : { ok: false, consulted: false, source: "fallback", reason: r.reason, guides: [] };
  } else if (cmd === "consult" && rest[0]) {
    out = consult({ query: rest[0] });
  } else {
    usage();
    process.exitCode = 2;
  }
  if (out) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
