#!/usr/bin/env node
/**
 * Bangkitkan docs/SKILLS-CATALOG.md dari router/skills-registry.json (v0.3.82).
 * Katalog lama ditulis tangan dan basi sejak v0.1.1 (687 skill, 107 aktif),
 * jadi sekarang selalu turunan registry. `npm run validate` gagal bila file
 * tidak sama dengan hasil generator (pakai --check).
 * Pakai: node scripts/gen-catalog.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATALOG = "docs/SKILLS-CATALOG.md";
const cell = (v) => (v == null || v === "" ? "—" : String(v).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim());
const status = (s) => (s.pack === "red-team" ? "disabled" : "active");

export function renderCatalog(reg) {
  const skills = reg.skills;
  const routable = skills.filter((s) => status(s) === "active").length;
  const byGroup = new Map();
  for (const s of skills) {
    const g = s.pack || "(aktif)";
    const e = byGroup.get(g) || { n: 0, sektor: new Map() };
    e.n++; e.sektor.set(s.sektor || "—", (e.sektor.get(s.sektor || "—") || 0) + 1);
    byGroup.set(g, e);
  }
  const groups = [...byGroup.entries()].sort(([a], [b]) => (a === "(aktif)" ? -1 : b === "(aktif)" ? 1 : a.localeCompare(b)));
  const lines = [
    "# Katalog skill Lumitome",
    "",
    "<!-- File ini dibangkitkan oleh scripts/gen-catalog.mjs dari router/skills-registry.json. Jangan edit manual: jalankan `npm run skills:catalog`. -->",
    "",
    `Total ${skills.length} skill di registry. ${routable} bisa di-route; ${skills.length - routable} (pack red-team) disabled.`,
    "",
    "Folder skill aktif ada di `.opencode/skills/`, skill pack di `packs/<pack>/skills/`. Keduanya satu korpus yang di-route lewat `skill_search` (lihat [`ROUTING.md`](ROUTING.md)). Lisensi dan atribusi per sumber: [`NOTICE.md`](../NOTICE.md).",
    "",
    "## Ringkasan per pack",
    "",
    "| pack | skill | sektor |",
    "|---|---|---|",
    ...groups.map(([g, e]) => `| ${g === "(aktif)" ? "(folder aktif)" : `\`${g}\``} | ${e.n} | ${[...e.sektor.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join(", ")} |`),
    "",
    "## Semua skill",
    "",
    "Kolom sumber, SHA, dan lisensi kosong (—) bila frontmatter skill pack tidak membawanya; jangkar provenance-nya adalah id upstream.",
    "",
    "| id | sumber | SHA | lisensi | sektor | status | pack | id upstream (asli) |",
    "|---|---|---|---|---|---|---|---|",
    ...skills.map((s) => `| \`${cell(s.id)}\` | ${cell(s.src)} | ${s.sha ? `\`${String(s.sha).slice(0, 12)}\`` : "—"} | ${cell(s.license)} | ${cell(s.sektor)} | ${status(s)} | ${cell(s.pack)} | ${s.original_id ? `\`${cell(s.original_id)}\`` : "—"} |`),
    "",
  ];
  return lines.join("\n");
}

export function checkCatalog(root = ".") {
  const reg = JSON.parse(fs.readFileSync(path.join(root, "router/skills-registry.json"), "utf8"));
  const want = renderCatalog(reg);
  let have = null; try { have = fs.readFileSync(path.join(root, CATALOG), "utf8"); } catch {}
  return { ok: have === want, want };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, want } = checkCatalog(".");
  if (process.argv.includes("--check")) {
    if (!ok) { console.error(`gen-catalog: ${CATALOG} basi — jalankan npm run skills:catalog`); process.exit(1); }
    console.log(`gen-catalog: ${CATALOG} OK`);
  } else { fs.writeFileSync(CATALOG, want); console.log(`gen-catalog: ${CATALOG} ditulis`); }
}
