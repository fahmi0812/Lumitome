#!/usr/bin/env node
/**
 * Bangkitkan router/skills-registry.json = PERSIS folder skill aktif di .opencode/skills (satu entri per folder).
 * Metadata pack (nonaktif) disimpan per pack: packs/<pack>/registry.json — bukan di registry aktif.
 *
 * Akar masalah v0.3.5 (registry 121 vs 86 skill nyata): importer lama memindai SEMUA SKILL.md di repo upstream,
 * termasuk salinan per-harness (.trae/ .agent/ .rovodev/ .claude/ … /skills/impeccable) → nama bentrok diberi
 * akhiran -2..-25 dan entri pack ikut masuk registry aktif. Di sini: hanya folder nyata; salinan cermin
 * (`<nama>-N` dengan metadata swanwright_original_name = <nama> yang sudah ada) ditandai mirror_of dan
 * dikeluarkan dari indeks router (folder & isinya tidak dihapus).
 * Pakai: node scripts/gen-registry.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { frontmatter } from "../router/parse.mjs";

const ROOT = process.cwd();
const REG = path.join(ROOT, "router/skills-registry.json");
const old = JSON.parse(fs.readFileSync(REG, "utf8"));
const byId = new Map(old.skills.map((s) => [s.id, s]));
for (const p of fs.readdirSync(path.join(ROOT, "packs"))) { const f = path.join(ROOT, "packs", p, "registry.json");
  if (fs.existsSync(f)) for (const s of JSON.parse(fs.readFileSync(f, "utf8")).skills) if (!s.mirror_of || s.sektor) { const { mirror_of, ...e } = s; if (!byId.has(s.id) && e.sektor) byId.set(s.id, e); } }
// field: baca satu kunci skalar dari frontmatter ter-parse (string atau null, seperti dulu).
// swanwright_* tinggal bersarang di bawah `metadata:` (688 file) — regex lama menemukannya
// karena mencari datar; di sini dicari di top-level dulu, lalu di metadata.
const field = (fm, k) => { const v = fm?.[k] ?? fm?.metadata?.[k]; return v == null ? null : String(v).trim(); };
export function isMirror(name, fm, known) {
  const orig = field(fm, "swanwright_original_name"); const m = name.match(/^(.+)-(\d+)$/);
  return !!(orig && m && m[1] === orig && known.has(orig)) ? orig : null;
}
function entry(dir, id, pack) {
  const fm = frontmatter(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")) || {}; const prev = byId.get(id);
  if (prev) return { ...prev, pack: pack || "" };
  return { id, name: id, sektor: field(fm, "swanwright_sector") || "misc", description: (field(fm, "description") || "").slice(0, 300), triggers: [], champion: false, fallback: null, cost: "low",
    requires_consent: false, pack: pack || "", src: field(fm, "swanwright_src") || "", sha: field(fm, "swanwright_sha") || "", license: field(fm, "license") || field(fm, "swanwright_license") || "",
    original_id: field(fm, "swanwright_original_id") || id, original_name: field(fm, "swanwright_original_name") || id };
}
const act = path.join(ROOT, ".opencode/skills");
const active = fs.readdirSync(act).filter((d) => fs.existsSync(path.join(act, d, "SKILL.md"))).sort();
const out = { ...old, skills: active.map((d) => entry(path.join(act, d), d, "")) };
const packs = {};
for (const p of fs.readdirSync(path.join(ROOT, "packs")).sort()) {
  const sd = path.join(ROOT, "packs", p, "skills"); if (!fs.existsSync(sd)) continue;
  const names = fs.readdirSync(sd).filter((d) => fs.existsSync(path.join(sd, d, "SKILL.md"))).sort();
  const known = new Set([...active, ...names]);
  const skills = names.flatMap((d) => { const e = byId.get(d); const mir = isMirror(d, frontmatter(fs.readFileSync(path.join(sd, d, "SKILL.md"), "utf8")), known);
    return e || mir ? [{ ...(e ? { ...e, pack: p } : { id: d }), ...(mir ? { mirror_of: mir } : {}) }] : []; });
  packs[p] = { pack: p, note: "dibangkitkan scripts/gen-registry.mjs; skill tanpa entri memakai frontmatter SKILL.md", skills };
}
const check = process.argv.includes("--check");
const IDX = path.join(ROOT, "router/skills-index.md");
// Indeks lazy (v0.3.21): dibangkitkan dari registry — satu sumber kebenaran, jangan edit manual.
// Urutan seksi = yang sudah dipakai file ini (coding, security, riset, penulisan, media, finance); di dalam seksi alfabetis (ikut registry).
// Deskripsi dipotong ~80 karakter: indeks ini pointer 1 baris (anggaran ~2,5k tok untuk 108 skill),
// deskripsi penuh ada di registry + frontmatter SKILL.md.
const SECTIONS = ["coding", "security", "riset", "penulisan", "media", "finance"];
const short = (d) => d.length > 80 ? d.slice(0, 80).trimEnd() + "…" : d;
const bySec = {};
for (const s of out.skills) (bySec[s.sektor] ||= []).push(s);
const blocks = ["# Skill index aktif (lazy)\nPack: `npm run enable-pack -- <nama>`. Karpathy via rules/06.\nDibangkitkan scripts/gen-registry.mjs — jangan edit manual."];
for (const sec of [...SECTIONS, ...Object.keys(bySec).sort().filter((s) => !SECTIONS.includes(s))]) {
  if (!bySec[sec]?.length) continue;
  blocks.push(`## ${sec}\n` + bySec[sec].map((s) => `- ${s.id}: ${short(s.description)}`).join("\n"));
}
const idxMd = blocks.join("\n\n") + "\n";
const want = { [REG]: JSON.stringify(out, null, 2) + "\n", [IDX]: idxMd, ...Object.fromEntries(Object.entries(packs).map(([p, v]) => [path.join(ROOT, "packs", p, "registry.json"), JSON.stringify(v, null, 2) + "\n"])) };
let stale = 0;
for (const [f, s] of Object.entries(want)) { const cur = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; if (cur !== s) { stale++; if (!check) fs.writeFileSync(f, s); } }
console.log(`gen-registry: aktif=${out.skills.length} mirror=${Object.values(packs).reduce((n, v) => n + v.skills.filter((s) => s.mirror_of).length, 0)} ${check ? (stale ? `STALE (${stale} file)` : "OK") : `ditulis ${stale} file`}`);
if (check && stale) process.exit(1);
