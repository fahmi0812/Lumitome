import fs from "fs";
import path from "path";
import { checkSkillsDir, checkConfig, checkAgents, checkPlugins, checkV2Config, checkMcpPolicy } from "./check-opencode.mjs";
import { frontmatter } from "../router/parse.mjs";
import { checkVersionConsistency } from "./version-check.mjs";
import { INDEX_SECTION_BUDGETS, INDEX_DEFAULT_SECTION_BUDGET, INDEX_TOTAL_BUDGET, indexSectionTokens } from "../router/index-budgets.mjs";

let fails = 0, warns = 0;
const fail = (m) => { console.error("[FAIL]", m); fails++; };
const warn = (m) => { console.warn("[WARN]", m); warns++; };
const pass = (m) => console.log("[PASS]", m);

const reg = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8"));
pass(`registry skills: ${reg.skills.length} (folder aktif ${reg.skills.filter((s) => !s.pack).length}, pack ${reg.skills.filter((s) => s.pack).length})`);
// TRIAL lepas-dorman: registry == folder skill aktif + folder skill pack
// non-cermin (scripts/gen-registry.mjs). Cermin = `<nama>-N` dengan
// swanwright_original_name = <nama> yang sudah ada — dikeluarkan.
{ const fmField = (fm, k) => fm?.[k] ?? fm?.metadata?.[k];
  const isMirror = (name, fm, known) => { const orig = fmField(fm, "swanwright_original_name"); const m = name.match(/^(.+)-(\d+)$/); return !!(orig && m && m[1] === orig && known.has(orig)); };
  const real = fs.readdirSync(".opencode/skills").filter((d) => fs.existsSync(path.join(".opencode/skills", d, "SKILL.md"))).sort();
  const expected = [...real.map((id) => ({ id, pack: "" }))];
  for (const p of fs.readdirSync("packs").sort()) { const sd = path.join("packs", p, "skills"); if (!fs.existsSync(sd)) continue;
    const names = fs.readdirSync(sd).filter((d) => fs.existsSync(path.join(sd, d, "SKILL.md"))).sort();
    const known = new Set([...real, ...names]);
    for (const d of names) { const fm = frontmatter(fs.readFileSync(path.join(sd, d, "SKILL.md"), "utf8")) || {}; if (!isMirror(d, fm, known)) expected.push({ id: d, pack: p }); } }
  const got = reg.skills.map((s) => ({ id: s.id, pack: s.pack || "" }));
  if (JSON.stringify(expected) !== JSON.stringify(got)) fail(`registry (${got.length}) != folder skill aktif+pack non-cermin (${expected.length}) — jalankan node scripts/gen-registry.mjs`);
  else pass(`registry == folder skill aktif+pack non-cermin (${expected.length})`); }
const ids = new Set();
for (const s of reg.skills) {
  if (ids.has(s.id)) fail(`duplicate id ${s.id}`);
  ids.add(s.id);
  const dir = s.pack ? path.join("packs", s.pack, "skills", s.id) : path.join(".opencode/skills", s.id);
  if (s.pack && s.champion) fail(`pack skill marked champion ${s.id}`);
  if (!fs.existsSync(path.join(dir, "SKILL.md"))) fail(`missing SKILL.md for ${s.pack ? "pack" : "active"} ${s.id}`);
  if (!s.original_id) fail(`provenance tidak lengkap (original_id) ${s.id}`);
  // TRIAL: src/sha/license wajib hanya untuk skill folder aktif. Skill pack
  // hasil impor upstream umumnya tidak membawa ketiganya di frontmatter
  // (529/580 tanpa src+sha, 400 tanpa license); jangkar provenance mereka
  // adalah original_id (ada di semua 580) + SKILL.md di folder pack.
  else if (!s.pack && (!s.src || !s.sha)) fail(`provenance tidak lengkap (src/sha) ${s.id}`);
  else {
    const t = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    if (!t.startsWith("---")) fail(`active skill missing frontmatter ${s.id}`);
  }
  if (!s.pack && !s.sha) fail(`missing sha ${s.id}`);
  if (!s.pack && !s.license) fail(`missing license ${s.id}`);
}
function walk(d, acc=[]) {
  if (!fs.existsSync(d)) return acc;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name === "SKILL.md") acc.push(p);
  }
  return acc;
}
const all = [...walk(".opencode/skills"), ...walk("packs")];
pass(`SKILL.md found: ${all.length}`);
for (const p of all) {
  const t = fs.readFileSync(p, "utf8");
  if (!t.startsWith("---")) {
    if (p.startsWith("packs/")) warn(`pack skill no frontmatter (lihat docs/ADAPTERS.md): ${p}`);
    else fail(`no frontmatter ${p}`);
  }
}
// --- Kompatibilitas OpenCode (v0.1.3) ---
const allNames = new Map();
const skillDirs = [".opencode/skills", ...fs.readdirSync("packs").map((p) => `packs/${p}/skills`)];
for (const d of skillDirs) {
  const { errors, names } = checkSkillsDir(d);
  errors.forEach(fail);
  for (const n of names) { if (allNames.has(n)) fail(`nama skill duplikat ${n}: ${allNames.get(n)} & ${d}`); else allNames.set(n, d); }
}
pass(`skill valid OpenCode (nama=folder, regex): ${allNames.size}; aktif ${fs.readdirSync(".opencode/skills").length}`);
const cfgErr = checkConfig();
if (cfgErr.length) cfgErr.forEach((e) => fail(`config schema: ${e}`)); else pass("opencode.jsonc lolos skema https://opencode.ai/config.json (ajv 2020)");
const agErr = checkAgents(); agErr.forEach(fail); if (!agErr.length) pass("agents frontmatter valid");
const plErr = checkPlugins(); plErr.forEach(fail); if (!plErr.length) pass("plugins v2: export default {id, setup}");
const v2Err = checkV2Config(); v2Err.forEach(fail); if (!v2Err.length) pass("opencode.jsonc native V2 (tanpa kunci V1 deprecated)");
const mcpErr = checkMcpPolicy(); mcpErr.forEach(fail); if (!mcpErr.length) pass("MCP: secret {env:} saja, versi dipin, figma/github/gateway disabled, deny-by-default, tanpa Kali/trading");
{
  const { execFileSync } = await import("node:child_process");
  try { execFileSync(process.execPath, ["scripts/gen-policy.mjs", "--check"], { stdio: "pipe" }); pass("permissions agent = hasil gen-policy (skill+MCP per sektor)"); }
  catch (e) { fail(`permissions agent basi: ${String(e.stdout || e.message).trim()} → npm run policy`); }
  const act = fs.readdirSync(".opencode/skills").filter((d) => fs.existsSync(`.opencode/skills/${d}/SKILL.md`));
  // P2-2: jumlah skill aktif TIDAK di-hardcode (pelajaran v0.3.20 untuk pack,
  // kini berlaku juga untuk aktif — dulu `act.length !== 127` di sini).
  // Kanoniknya registry: folder aktif harus sama dengan entri aktif registry;
  // selisih tetap gagal, tapi menambah skill ke-128 tidak lagi mematahkan gate.
  const expectedActive = reg.skills.filter((s) => !s.pack).length;
  if (act.length !== expectedActive) fail(`folder skill aktif ${act.length} != registry aktif ${expectedActive}`); else pass(`folder skill aktif = ${act.length} (registry aktif)`);
  for (const n of ["api-security", "llm-security"]) if (act.includes(n)) fail(`${n} tidak boleh aktif`);
}
// --- Konsistensi versi single-source (P2-2): VERSION vs package.json vs README vs CHANGELOG ---
// Sebagian sudah dicek bump-version saat menaikkan versi; di sini ditegakkan
// tiap validate agar drift (mis. README/CHANGELOG lupa ikut) gagal cepat.
const verErrs = checkVersionConsistency(".");
for (const e of verErrs) fail(`versi tidak konsisten: ${e}`);
if (verErrs.length === 0) pass(`versi konsisten (VERSION = package.json = README = CHANGELOG: ${fs.readFileSync("VERSION", "utf8").trim()})`);
const g = JSON.parse(fs.readFileSync("tests/golden-routing.json", "utf8"));
if (g.length < 120) fail(`golden ${g.length} < 120`); else pass(`golden ${g.length}`);
const orch = fs.readFileSync(".opencode/agents/orchestrator.md", "utf8");
const tok = Math.ceil(orch.length / 4);
if (tok > 600) fail(`orchestrator ~${tok} tok > 600`); else pass(`orchestrator ~${tok} tok`);
const idx = fs.readFileSync("router/skills-index.md", "utf8");
// TRIAL lepas-dorman: budget per seksi (router/index-budgets.mjs), bukan satu
// cap total 2500 — indeks kini 734 entri / ~17,7k tok. Validate memperingatkan
// (seperti dulu); asersi kerasnya di tests/suite.mjs.
const secTok = indexSectionTokens(idx);
for (const [sec, tok] of Object.entries(secTok)) { if (sec === "total") continue;
  const cap = INDEX_SECTION_BUDGETS[sec] ?? INDEX_DEFAULT_SECTION_BUDGET;
  if (tok > cap) warn(`skills-index seksi ${sec} ~${tok} tok > budget ${cap}`); }
if (secTok.total > INDEX_TOTAL_BUDGET) warn(`skills-index total ~${secTok.total} tok > budget ${INDEX_TOTAL_BUDGET}`);
else pass(`skills-index ~${secTok.total} tok (per seksi: ${Object.entries(secTok).filter(([k]) => k !== "total").map(([k, v]) => `${k}~${v}`).join(", ")})`);
// Indeks memuat semua skill registry KECUALI red-team (disabled).
for (const s of reg.skills.filter((x) => x.pack !== "red-team")) if (!idx.includes(`- ${s.id}:`)) fail(`skill tidak di indeks ${s.id}`);
for (const s of reg.skills.filter((x) => x.pack === "red-team")) if (idx.includes(`- ${s.id}:`)) fail(`red-team di indeks ${s.id}`);
const rule = fs.readFileSync(".opencode/rules/06-coding-karpathy.md", "utf8");
if (Math.ceil(rule.length/4) > 150) fail("rules/06 > 150 tok"); else pass(`rules/06 ~${Math.ceil(rule.length/4)} tok`);
// Allowlist scanner wajib beralasan
const strip = (s) => s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const osvToml = fs.existsSync("osv-scanner.toml") ? strip(fs.readFileSync("osv-scanner.toml", "utf8")) : "";
for (const b of osvToml.split(/\[\[IgnoredVulns\]\]/).slice(1)) if (!/^\s*reason\s*=\s*"[^"]{8,}"/m.test(b)) fail("osv-scanner.toml: IgnoredVulns tanpa reason");
const glToml = fs.existsSync(".gitleaks.toml") ? strip(fs.readFileSync(".gitleaks.toml", "utf8")) : "";
for (const b of glToml.split(/\[\[allowlists\]\]|\[allowlist\]/).slice(1)) if (!/^\s*description\s*=\s*['"][^'"]{8,}/m.test(b)) fail(".gitleaks.toml: allowlist tanpa description");
pass("allowlist scanner beralasan");
console.log(fails ? `FAILED ${fails} (warns ${warns})` : `OK (warns ${warns})`);
process.exit(fails ? 1 : 0);
