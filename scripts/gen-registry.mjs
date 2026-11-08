#!/usr/bin/env node
/**
 * Bangkitkan router/skills-registry.json = SATU katalog semua skill (aktif + pack).
 *
 * Kontrak TRIAL lepas-dorman (branch trial/no-dormant; BUKAN rilis):
 * - Registry utama memuat SEMUA skill non-cermin: 110 folder `.opencode/skills`
 *   (pack="") + semua folder `packs/<pack>/skills` (pack="<nama pack>").
 *   Folder pack tetap sebagai penyimpanan/provenance; yang berubah hanya
 *   status routing-nya (lihat router/skill-db.mjs: pack non-red-team = active).
 * - Per-pack `packs/<pack>/registry.json` TETAP dibangkitkan (berisi entri penuh
 *   pack itu + stub cermin): `collectSkills`/`sourceHash` membacanya untuk
 *   daftar cermin dan sebagai cadangan kurasi; menghapusnya berarti menulis
 *   ulang deteksi cermin di skill-db — diff lebih besar tanpa manfaat.
 * - Salinan cermin (`<nama>-N` dengan metadata swanwright_original_name = <nama>
 *   yang sudah ada) ditandai mirror_of dan dikeluarkan dari registry utama
 *   maupun indeks router (folder & isinya tidak dihapus).
 * - Entri pack tanpa kurasi dibuat penuh dari frontmatter SKILL.md (seperti
 *   entry() untuk skill aktif), bukan di-drop: sebelumnya design-extra 54
 *   folder hanya menghasilkan 30 entri karena sisanya tak punya entri byId.
 *
 * Deskripsi registry vs frontmatter (drift 48→50 design-assets, v0.3.26):
 * deskripsi kurasi dipertahankan — menyegarkan semuanya akan menulis ulang
 * ~90 deskripsi dan mengubah permukaan routing FTS. PENGECUALIAN: deskripsi
 * yang TURUNAN frontmatter (berbagi awalan >=32 char dengan deskripsi
 * frontmatter sekarang — celah ukur: turunan >=40, kurasi terdekat 27)
 * disegarkan dari frontmatter. Itu yang membuat perbaikan faktual di sumber
 * (mis. 48→50 di SKILL.md design-assets) sampai ke registry dan bertahan
 * setelah regen — dan idempotent, karena sesudah segar nilainya ==
 * potongan frontmatter baru. Deskripsi kurasi (ditulis ulang, bukan turunan
 * frontmatter) tidak tersentuh.
 *
 * Sektor pack tanpa swanwright_sector di frontmatter (529 dari 580 folder)
 * dipetakan dari nama pack (PACK_SECTOR, ASUMSI trial — lihat bawah):
 * tanpa sektor, skill tidak masuk allowlist sektor mana pun dan hanya
 * terjangkau lewat orchestrator / pelebaran L0. `misc` tidak dipetakan
 * (tidak ada sektor yang jujur untuknya) dan tetap "misc".
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
// ASUMSI trial: sektor turunan nama pack untuk skill pack yang frontmatter-nya
// tidak membawa swanwright_sector. Alasan per pack: coding-extra/gamedev/cad/
// design-extra = kerja kode/desain (skill desain aktif sudah bersektor coding);
// seo/career-extra = kerja tulis/konten (penulisan); osint-extra = riset;
// motion membawa swanwright_sector=media di frontmatter (peta ini hanya fallback).
// misc sengaja tidak dipetakan — isinya campuran tanpa sektor yang jujur.
export const PACK_SECTOR = { cad: "coding", "career-extra": "penulisan", "coding-extra": "coding", "design-extra": "coding", gamedev: "coding", motion: "media", "osint-extra": "riset", "red-team": "security", seo: "penulisan" };
function entry(dir, id, pack) {
  const fm = frontmatter(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")) || {}; const prev = byId.get(id);
  const fmDesc = field(fm, "description") || "";
  if (prev) {
    // Deskripsi turunan frontmatter disegarkan (lihat header); kurasi dipertahankan.
    // Deteksi turunan = deskripsi registry berbagi awalan >=32 char dengan frontmatter
    // sekarang. Ambang ini duduk di celah ukur: 22 skill turunan punya awalan
    // bersama >=40 char, kurasi terdekat berikutnya hanya 27 char (floorplan).
    // Ambang awalan (bukan kesamaan penuh) penting: perbaikan faktual DI DALAM
    // teks — mis. "48"→"50" di design-assets — memutus kesamaan penuh tapi
    // tidak memutus awalan 40 char sebelum angka itu. Setelah segar, nilainya
    // == potongan frontmatter baru sehingga regen berikutnya idempotent.
    // `sha` disegarkan seperti dulu (ditemukan v0.3.26: sha "" menempel selamanya
    // karena prev dikembalikan utuh).
    let cp = 0; const fm300 = fmDesc.slice(0, 300);
    while (cp < Math.min(prev.description.length, fm300.length) && prev.description[cp] === fm300[cp]) cp++;
    const derived = !!prev.description && cp >= 32;
    return { ...prev, ...(derived ? { description: fm300 } : {}), pack: pack || "", sha: field(fm, "swanwright_sha") || prev.sha };
  }
  return { id, name: id, sektor: field(fm, "swanwright_sector") || PACK_SECTOR[pack] || "misc", description: fmDesc.slice(0, 300), triggers: [], champion: false, fallback: null, cost: "low",
    requires_consent: false, pack: pack || "", src: field(fm, "swanwright_src") || "", sha: field(fm, "swanwright_sha") || "", license: field(fm, "license") || field(fm, "swanwright_license") || "",
    original_id: field(fm, "swanwright_original_id") || id, original_name: field(fm, "swanwright_original_name") || id };
}
const act = path.join(ROOT, ".opencode/skills");
const active = fs.readdirSync(act).filter((d) => fs.existsSync(path.join(act, d, "SKILL.md"))).sort();
const packSkills = [];
const packs = {};
for (const p of fs.readdirSync(path.join(ROOT, "packs")).sort()) {
  const sd = path.join(ROOT, "packs", p, "skills"); if (!fs.existsSync(sd)) continue;
  const names = fs.readdirSync(sd).filter((d) => fs.existsSync(path.join(sd, d, "SKILL.md"))).sort();
  const known = new Set([...active, ...names]);
  // Entri penuh dari frontmatter/kurasi untuk semua skill pack non-cermin;
  // cermin hanya stub {id, mirror_of} (tidak masuk registry utama).
  const skills = names.map((d) => { const mir = isMirror(d, frontmatter(fs.readFileSync(path.join(sd, d, "SKILL.md"), "utf8")), known);
    if (mir) return { id: d, mirror_of: mir };
    const e = entry(path.join(sd, d), d, p); packSkills.push(e); return e; });
  packs[p] = { pack: p, note: "dibangkitkan scripts/gen-registry.mjs; skill tanpa entri kurasi memakai frontmatter SKILL.md", skills };
}
const out = { ...old, skills: [...active.map((d) => entry(path.join(act, d), d, "")), ...packSkills] };
const check = process.argv.includes("--check");
const IDX = path.join(ROOT, "router/skills-index.md");
// Indeks lazy: dibangkitkan dari registry — satu sumber kebenaran, jangan edit manual.
// Urutan seksi = yang sudah dipakai file ini (coding, security, riset, penulisan, media, finance); di dalam seksi alfabetis.
// Deskripsi dipotong ~80 karakter: indeks ini pointer 1 baris, deskripsi penuh ada di registry + frontmatter SKILL.md.
// TRIAL lepas-dorman: indeks memuat SEMUA skill registry KECUALI pack red-team
// (disabled — skill ofensif tidak boleh ter-route). Budget per seksi: router/index-budgets.mjs.
// Satu file (bukan satu file per sektor): diff terkecil — generator, --check,
// dan konsumen (validate/suite) sudah berbentuk satu file; per-seksi cukup
// diasersi, bukan dipecah.
const SECTIONS = ["coding", "security", "riset", "penulisan", "media", "finance"];
const short = (d) => d.length > 80 ? d.slice(0, 80).trimEnd() + "…" : d;
const bySec = {};
for (const s of out.skills.filter((x) => x.pack !== "red-team")) (bySec[s.sektor] ||= []).push(s);
const blocks = ["# Skill index (lazy)\nSemua skill registry kecuali pack red-team (disabled). Karpathy via rules/06.\nDibangkitkan scripts/gen-registry.mjs — jangan edit manual. Budget per seksi: router/index-budgets.mjs."];
for (const sec of [...SECTIONS, ...Object.keys(bySec).sort().filter((s) => !SECTIONS.includes(s))]) {
  if (!bySec[sec]?.length) continue;
  blocks.push(`## ${sec}\n` + [...bySec[sec]].sort((a, b) => a.id < b.id ? -1 : 1).map((s) => `- ${s.id}: ${short(s.description)}`).join("\n"));
}
const idxMd = blocks.join("\n\n") + "\n";
const want = { [REG]: JSON.stringify(out, null, 2) + "\n", [IDX]: idxMd, ...Object.fromEntries(Object.entries(packs).map(([p, v]) => [path.join(ROOT, "packs", p, "registry.json"), JSON.stringify(v, null, 2) + "\n"])) };
let stale = 0;
for (const [f, s] of Object.entries(want)) { const cur = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; if (cur !== s) { stale++; if (!check) fs.writeFileSync(f, s); } }
console.log(`gen-registry: total=${out.skills.length} aktif-folder=${active.length} pack=${packSkills.length} mirror=${Object.values(packs).reduce((n, v) => n + v.skills.filter((s) => s.mirror_of).length, 0)} ${check ? (stale ? `STALE (${stale} file)` : "OK") : `ditulis ${stale} file`}`);
if (check && stale) process.exit(1);
