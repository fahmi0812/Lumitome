import fs from "fs";
import path from "path";
import { checkSkillsDir, checkConfig, checkAgents, checkPlugins, checkV2Config, checkMcpPolicy } from "./check-opencode.mjs";

let fails = 0, warns = 0;
const fail = (m) => { console.error("[FAIL]", m); fails++; };
const warn = (m) => { console.warn("[WARN]", m); warns++; };
const pass = (m) => console.log("[PASS]", m);

const reg = JSON.parse(fs.readFileSync("router/skills-registry.json", "utf8"));
pass(`registry skills: ${reg.skills.length} (aktif ${reg.skills.filter((s) => !s.pack).length})`);
// registry aktif == folder skill nyata di .opencode/skills (scripts/gen-registry.mjs)
{ const real = fs.readdirSync(".opencode/skills").filter((d) => fs.existsSync(path.join(".opencode/skills", d, "SKILL.md"))).sort();
  const regIds = reg.skills.map((s) => s.id).sort();
  if (JSON.stringify(real) !== JSON.stringify(regIds)) fail(`registry (${regIds.length}) != folder skill aktif (${real.length}) — jalankan node scripts/gen-registry.mjs`);
  else pass(`registry == folder skill aktif (${real.length})`); }
const ids = new Set();
for (const s of reg.skills) {
  if (ids.has(s.id)) fail(`duplicate id ${s.id}`);
  ids.add(s.id);
  const dir = s.pack ? path.join("packs", s.pack, "skills", s.id) : path.join(".opencode/skills", s.id);
  if (s.pack && s.champion) fail(`pack skill marked champion ${s.id}`);
  if (!fs.existsSync(path.join(dir, "SKILL.md"))) fail(`missing SKILL.md for ${s.pack ? "pack" : "active"} ${s.id}`);
  if (!s.original_id || !s.src || !s.sha) fail(`provenance tidak lengkap ${s.id}`);
  else {
    const t = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    if (!t.startsWith("---")) fail(`active skill missing frontmatter ${s.id}`);
  }
  if (!s.sha) fail(`missing sha ${s.id}`);
  if (!s.license) fail(`missing license ${s.id}`);
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
  if (act.length !== 108) fail(`skill aktif ${act.length} != 108`); else pass("skill aktif = 108");
  for (const n of ["api-security", "llm-security"]) if (act.includes(n)) fail(`${n} tidak boleh aktif`);
}
const g = JSON.parse(fs.readFileSync("tests/golden-routing.json", "utf8"));
if (g.length < 120) fail(`golden ${g.length} < 120`); else pass(`golden ${g.length}`);
const orch = fs.readFileSync(".opencode/agents/orchestrator.md", "utf8");
const tok = Math.ceil(orch.length / 4);
if (tok > 600) fail(`orchestrator ~${tok} tok > 600`); else pass(`orchestrator ~${tok} tok`);
const idx = fs.readFileSync("router/skills-index.md", "utf8");
const idxTok = Math.ceil(idx.length/4);
if (idxTok > 2500) warn(`skills-index ~${idxTok} tok > ~2.5k`); else pass(`skills-index ~${idxTok} tok`);
for (const s of reg.skills.filter((x) => !x.pack)) if (!idx.includes(`- ${s.id}:`)) fail(`aktif tidak di indeks ${s.id}`);
for (const s of reg.skills.filter((x) => x.pack)) if (idx.includes(`- ${s.id}:`)) fail(`pack masih di indeks ${s.id}`);
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
