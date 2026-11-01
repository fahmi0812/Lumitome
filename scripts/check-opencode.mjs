/** Cek kompatibilitas OpenCode: skema config (ajv, draft 2020-12), nama skill = folder, regex nama, frontmatter agent. */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

let YAML = null;
try { YAML = createRequire(import.meta.url)("yaml"); } catch { /* fallback di bawah */ }

/** Parse frontmatter YAML. YAML rusak → { __error } (OpenCode akan melewati skill itu). */
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  if (YAML) {
    try { const v = YAML.parse(m[1]); return v && typeof v === "object" ? v : { __error: "bukan map" }; }
    catch (e) { return { __error: String(e.message).split("\n")[0] }; }
  }
  const fm = {};
  for (const line of m[1].split("\n")) {
    const k = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (k) fm[k[1]] = k[2].replace(/^['"]|['"]$/g, "");
  }
  return fm;
}

/** Validasi satu direktori skills (mis. `.opencode/skills` atau `packs/x/skills`). */
export function checkSkillsDir(dir) {
  const errors = [], names = [];
  if (!fs.existsSync(dir)) return { errors, names };
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = path.join(dir, d.name, "SKILL.md");
    if (!fs.existsSync(f)) { errors.push(`${dir}/${d.name}: SKILL.md tidak ada`); continue; }
    const fm = frontmatter(fs.readFileSync(f, "utf8"));
    if (!fm) { errors.push(`${f}: tanpa frontmatter`); continue; }
    if (fm.__error) { errors.push(`${f}: YAML frontmatter rusak: ${fm.__error}`); continue; }
    if (!fm.name) errors.push(`${f}: name kosong`);
    else {
      if (!NAME_RE.test(fm.name) || fm.name.length > 64) errors.push(`${f}: name "${fm.name}" tidak valid (regex ^[a-z0-9]+(-[a-z0-9]+)*$, ≤64)`);
      if (fm.name !== d.name) errors.push(`${f}: name "${fm.name}" != folder "${d.name}"`);
      names.push(fm.name);
    }
    if (!fm.description || fm.description.length < 1 || fm.description.length > 1024) errors.push(`${f}: description harus 1–1024 karakter`);
  }
  return { errors, names };
}

export function checkConfig(file = "opencode.jsonc", schemaFile = "scripts/schema/opencode-config.schema.json") {
  const require = createRequire(import.meta.url);
  let Ajv2020;
  try { Ajv2020 = require("ajv/dist/2020").default; }
  catch { return ["ajv belum terpasang → jalankan `npm install` (devDependency ajv 8.20.0)"]; }
  const cfg = JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
  const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  // Skema eksternal yang dirujuk config.json di-vendor (snapshot) agar validasi offline.
  for (const f of fs.readdirSync(path.dirname(schemaFile))) {
    const p = path.join(path.dirname(schemaFile), f);
    if (p === schemaFile || !f.endsWith(".json")) continue;
    const s = JSON.parse(fs.readFileSync(p, "utf8"));
    if (s.$id) ajv.addSchema(s);
  }
  const validate = ajv.compile(schema);
  if (validate(cfg)) return [];
  return validate.errors.map((e) => `${file}${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
}

export function checkAgents(dir = ".opencode/agents") {
  const errors = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (/[{}]/.test(e.name)) errors.push(`${p}: folder sampah`); walk(p); continue; }
      if (!e.name.endsWith(".md")) continue;
      const fm = frontmatter(fs.readFileSync(p, "utf8"));
      if (!fm?.description) errors.push(`${p}: description wajib`);
      if (fm?.mode && !["primary", "subagent", "all"].includes(fm.mode)) errors.push(`${p}: mode tidak valid`);
      if (fm?.__error) errors.push(`${p}: YAML rusak ${fm.__error}`);
      // OpenCode v2: frontmatter V2 = `permissions` (array {action,resource,effect}); `permission`/`tools` = V1 deprecated.
      if (fm && "permission" in fm) errors.push(`${p}: kunci V1 "permission" deprecated di OpenCode v2 (pakai "permissions")`);
      if (fm && "tools" in fm) errors.push(`${p}: kunci V1 "tools" deprecated di OpenCode v2 (pakai "permissions")`);
      if (fm && "prompt" in fm) errors.push(`${p}: kunci V1 "prompt" deprecated (pakai "system")`);
      if (fm && "permissions" in fm && !Array.isArray(fm.permissions)) errors.push(`${p}: "permissions" harus array`);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return errors;
}

export function checkPlugins(dir = ".opencode/plugins") {
  // OpenCode v2: file .ts/.js langsung atau folder paket di .opencode/plugins/ di-autodiscover;
  // modul wajib `export default` Plugin.define({ id, setup }). Hook V1 (`"tool.execute.before"`) tidak jalan di v2.
  const errors = [];
  if (!fs.existsSync(dir)) return errors;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) continue;
    if (!/\.(ts|js|mjs)$/.test(e.name)) continue;
    const t = fs.readFileSync(path.join(dir, e.name), "utf8");
    if (!/export\s+default\b/.test(t)) errors.push(`${dir}/${e.name}: v2 wajib export default Plugin.define({id, setup})`);
    if (!/\bid\s*:/.test(t) || !/\bsetup\s*\(/.test(t)) errors.push(`${dir}/${e.name}: plugin v2 wajib punya id + setup(ctx)`);
    if (/["']tool\.execute\.before["']/.test(t)) errors.push(`${dir}/${e.name}: hook V1 "tool.execute.before" tidak didukung v2`);
  }
  return errors;
}

// Kunci config V1 yang deprecated di OpenCode v2 (https://opencode.ai/v2/docs/migrate-v1/).
export const V1_KEYS = ["permission", "agent", "mode", "provider", "plugin", "command", "tools"];
export function checkV2Config(file = "opencode.jsonc") {
  const cfg = JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
  const errors = V1_KEYS.filter((k) => k in cfg).map((k) => `${file}: kunci V1 "${k}" deprecated di v2`);
  const mcp = cfg.mcp || {};
  for (const k of Object.keys(mcp)) if (k !== "servers" && k !== "timeout") errors.push(`${file}: mcp.${k} V1 — v2 pakai mcp.servers.${k}`);
  for (const [k, v] of Object.entries(mcp.servers || {})) if ("enabled" in v) errors.push(`${file}: mcp.servers.${k}.enabled V1 — pakai disabled`);
  if (!Array.isArray(cfg.permissions)) errors.push(`${file}: v2 wajib "permissions" array`);
  return errors;
}

/** v0.1.6: kebijakan MCP — rahasia hanya {env:..}, pin versi, server terlarang, default disabled, deny-by-default. */
export function checkMcpPolicy(file = "opencode.jsonc", mapFile = "router/mcp-sectors.json") {
  const cfg = JSON.parse(stripJsonc(fs.readFileSync(file, "utf8")));
  const M = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const sv = cfg.mcp?.servers || {};
  const e = [];
  const raw = fs.readFileSync(file, "utf8");
  if (/(ghp_|github_pat_|sk-[A-Za-z0-9]{16,}|figd_|xox[bp]-)/.test(raw)) e.push(`${file}: pola token literal terdeteksi`);
  const envOnly = (v) => /^(Bearer )?\{env:[A-Z0-9_]+\}$/.test(v);
  for (const [n, s] of Object.entries(sv)) {
    if (M.banned.some((b) => n.toLowerCase().includes(b) || JSON.stringify(s).toLowerCase().includes(b))) e.push(`mcp.servers.${n}: server terlarang (Kali/trading)`);
    for (const [k, v] of Object.entries(s.headers || {})) if (!envOnly(v)) e.push(`mcp.servers.${n}.headers.${k}: wajib {env:...}`);
    for (const [k, v] of Object.entries(s.environment || {})) if (/key|token|secret|pass/i.test(k) && !envOnly(v)) e.push(`mcp.servers.${n}.environment.${k}: wajib {env:...}`);
    const cmd = (s.command || []).join(" ");
    if (/@latest\b/.test(cmd)) e.push(`mcp.servers.${n}: versi @latest tidak boleh`);
    if (s.command?.[0] === "npx" && !s.command.some((a) => /^@?[^@\s]+(\/[^@\s]+)?@\d/.test(a))) e.push(`mcp.servers.${n}: paket npx wajib dipin`);
    if (s.command?.[0] === "uvx" && !s.command.some((a) => /==\d/.test(a))) e.push(`mcp.servers.${n}: paket uvx wajib dipin (==)`);
    if (/codebase-memory-mcp\s+(install|update)/.test(cmd)) e.push(`mcp.servers.${n}: jangan jalankan install/update`);
    if (s.codemode === false) e.push(`mcp.servers.${n}: Code Mode wajib tetap aktif`);
  }
  for (const n of ["figma", "github"]) if (sv[n] && sv[n].disabled !== true) e.push(`mcp.servers.${n}: wajib disabled default`);
  for (const n of Object.keys(sv)) if (n.startsWith("gw-") && sv[n].disabled !== true) e.push(`mcp.servers.${n}: gateway wajib disabled default`);
  for (const n of ["context7", "codemem"]) if (!sv[n] || sv[n].disabled) e.push(`mcp.servers.${n}: wajib ada & enabled`);
  for (const [sec, list] of Object.entries(M.sectors)) for (const n of [...list, `skills-${sec}`, `gw-${sec}`]) if (!sv[n]) e.push(`mapping ${sec}: server ${n} tidak ada di config`);
  const perms = cfg.permissions || [];
  const di = perms.findIndex((p) => p.action === "*_*" && p.effect === "deny");
  if (di < 0) e.push(`${file}: wajib deny-by-default MCP ("*_*" deny)`);
  if (!perms.some((p, i) => i > di && p.action === "external_directory" && p.effect === "ask")) e.push(`${file}: external_directory ask harus setelah "*_*" deny`);
  if (!perms.some((p) => p.action === "shell" && /git push \*main\*/.test(p.resource) && p.effect === "deny")) e.push(`${file}: deny git push main hilang`);
  return e;
}
