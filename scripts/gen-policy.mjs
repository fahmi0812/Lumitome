#!/usr/bin/env node
/**
 * Bangkitkan frontmatter `permissions` agent (skill + MCP) dari router/mcp-sectors.json + skills-registry.
 * Deterministik. Pakai: node scripts/gen-policy.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { collectSkills, sectorAllowlist, SECTORS } from "../router/skill-db.mjs";

const M = JSON.parse(fs.readFileSync("router/mcp-sectors.json", "utf8"));
const q = (s) => JSON.stringify(s);
const rule = (a, r, e) => `  - { action: ${q(a)}, resource: ${q(r)}, effect: ${e} }`;

export function mcpRules(servers, sector) {
  const out = [rule("*_*", "*", "deny"), rule("external_directory", "*", "ask")];
  const own = [...servers, ...(sector ? [`skills-${sector}`, `gw-${sector}`] : [])];
  for (const s of own) {
    out.push(rule(`${s}_*`, "*", "allow"));
    out.push(rule("opencode_list_mcp_resources", s, "allow"));
    for (const a of M.servers[s]?.ask || []) out.push(rule(`${s}_${a}`, "*", "ask"));
  }
  return out;
}
export function skillRules(names) {
  return [rule("skill", "*", "deny"), ...names.map((n) => rule("skill", n, "allow")), rule("skill", "*offensive*", "ask")];
}
function rebuild(file, extra) {
  const t = fs.readFileSync(file, "utf8");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(t);
  const keep = m[1].split("\n").filter((l) => /^(description|mode):/.test(l));
  // pertahankan rules non-generated (edit/subagent orchestrator)
  const manual = m[1].split("\n").filter((l) => /^\s+- \{ action: (edit|subagent|shell)\b/.test(l));
  const fm = [...keep, "# permissions: DIBANGKITKAN scripts/gen-policy.mjs — jangan edit manual (kecuali edit/subagent/shell)", "permissions:", ...manual, ...extra].join("\n");
  return `---\n${fm}\n---\n${t.slice(m[0].length).replace(/^\n*/, "\n")}`;
}
export function plan(root = ".") {
  const skills = collectSkills(root).filter((s) => s.status === "active");
  const allow = sectorAllowlist(skills);
  const files = {};
  for (const sec of SECTORS) files[`.opencode/agents/sectors/${sec}.md`] = [...mcpRules(M.sectors[sec], sec), ...skillRules(allow[sec])];
  for (const [ag, sv] of Object.entries(M.agents)) files[`.opencode/agents/${ag}.md`] = mcpRules(sv, null);
  return Object.fromEntries(Object.entries(files).map(([f, ex]) => [f, rebuild(path.join(root, f), ex)]));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const p = plan();
  const stale = Object.entries(p).filter(([f, c]) => fs.readFileSync(f, "utf8") !== c).map(([f]) => f);
  if (process.argv.includes("--check")) { console.log(stale.length ? `gen-policy: STALE ${stale.join(", ")}` : "gen-policy: OK"); process.exit(stale.length ? 1 : 0); }
  for (const [f, c] of Object.entries(p)) fs.writeFileSync(f, c);
  console.log(`gen-policy: tulis ${Object.keys(p).length} agent (${stale.length} berubah)`);
}
