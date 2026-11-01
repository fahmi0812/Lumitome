/**
 * `npm run enable-pack -- <pack>`  : salin skill pack ke .opencode/skills (dimuat OpenCode), lalu validasi.
 * `npm run enable-pack -- <pack> --disable` : hapus salinan itu dari .opencode/skills.
 * Sumber di packs/<pack>/skills tetap utuh (provenance).
 */
import fs from "fs";
import path from "path";
import { checkSkillsDir } from "./check-opencode.mjs";

const [name, flag] = process.argv.slice(2);
if (!name) { console.error("usage: npm run enable-pack -- <pack> [--disable]"); process.exit(1); }
const packDir = path.join("packs", name);
const pj = path.join(packDir, "pack.json");
if (!fs.existsSync(pj)) { console.error("pack tidak dikenal:", name, "— tersedia:", fs.readdirSync("packs").join(", ")); process.exit(1); }
const meta = JSON.parse(fs.readFileSync(pj, "utf8"));
const src = path.join(packDir, meta.skills_dir || "skills");
const dst = ".opencode/skills";
const skills = fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

if (flag === "--disable") {
  for (const s of skills) fs.rmSync(path.join(dst, s), { recursive: true, force: true });
  meta.enabled = false;
  fs.writeFileSync(pj, JSON.stringify(meta, null, 2) + "\n");
  console.log(`pack ${name} dinonaktifkan (${skills.length} skill dihapus dari ${dst}). Restart OpenCode.`);
  process.exit(0);
}

const pre = checkSkillsDir(src);
if (pre.errors.length) { pre.errors.forEach((e) => console.error("[FAIL]", e)); process.exit(1); }
const clash = skills.filter((s) => fs.existsSync(path.join(dst, s)));
if (clash.length) { console.error("[FAIL] nama bentrok di .opencode/skills:", clash.join(", ")); process.exit(1); }
for (const s of skills) fs.cpSync(path.join(src, s), path.join(dst, s), { recursive: true });
const post = checkSkillsDir(dst);
if (post.errors.length) { post.errors.forEach((e) => console.error("[FAIL]", e)); process.exit(1); }
meta.enabled = true;
fs.writeFileSync(pj, JSON.stringify(meta, null, 2) + "\n");
console.log(`pack ${name} aktif: ${skills.length} skill disalin ke ${dst} (total ${post.names.length}, semua valid). Restart OpenCode.`);
