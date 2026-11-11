#!/usr/bin/env node
/**
 * Naikkan versi Lumitome (single-source: file VERSION).
 * Pakai: node scripts/bump-version.mjs <x.y.z> ["judul rilis"]
 * Menulis: VERSION, package.json, package-lock.json, README (badge + tarball), CHANGELOG (header + placeholder catatan).
 * TIDAK menulis: lumitome/bin/lumitome.mjs, install.sh (keduanya membaca VERSION saat jalan),
 *   tests/suite-services.mjs (tes konsistensi membaca VERSION, tanpa hardcode).
 * Sesudahnya: isi catatan rilis di CHANGELOG.md, lalu gate (npm run validate && npm test),
 *   baru commit + tag + simulasi updater + GitHub Release.
 */
import fs from "node:fs";

const fail = (m) => { console.error(`bump-version: ${m}`); process.exit(2); };
const next = process.argv[2];
const title = process.argv[3] || "";
if (!/^\d+\.\d+\.\d+$/.test(next || "")) fail("pakai: node scripts/bump-version.mjs <x.y.z> [\"judul rilis\"]");
const cur = fs.readFileSync("VERSION", "utf8").trim();
const cmp = (a, b) => a.split(".").map(Number).reduce((r, x, i) => r || Math.sign(x - b.split(".").map(Number)[i]), 0);
if (cmp(next, cur) <= 0) fail(`${next} bukan kenaikan dari ${cur}`);
const rep = (file, from, to, expect) => {
  const t = fs.readFileSync(file, "utf8");
  const n = t.split(from).length - 1;
  if (n !== expect) fail(`${file}: pola ${JSON.stringify(from)} ditemukan ${n}x, harus ${expect}x`);
  fs.writeFileSync(file, t.split(from).join(to));
};
fs.writeFileSync("VERSION", next + "\n");
rep("package.json", `"version": "${cur}"`, `"version": "${next}"`, 1);
rep("package-lock.json", `"version": "${cur}"`, `"version": "${next}"`, 2);
rep("README.md", `version-${cur}`, `version-${next}`, 1);
rep("README.md", `refs/tags/v${cur}.tar.gz`, `refs/tags/v${next}.tar.gz`, 1);
const cl = fs.readFileSync("CHANGELOG.md", "utf8");
if (cl.includes(`## ${next}`)) fail(`CHANGELOG.md sudah punya entri ${next}`);
fs.writeFileSync("CHANGELOG.md", cl.replace("# Changelog\n\n", `# Changelog\n\n## ${next}${title ? ` — ${title}` : ""}\n\n- TODO: isi catatan rilis\n\n`));
// verifikasi sendiri: VERSION == package.json == README
const ok = fs.readFileSync("VERSION", "utf8").trim() === next
  && JSON.parse(fs.readFileSync("package.json", "utf8")).version === next
  && fs.readFileSync("README.md", "utf8").includes(`version-${next}`)
  && fs.readFileSync("README.md", "utf8").includes(`refs/tags/v${next}.tar.gz`);
if (!ok) fail("verifikasi gagal setelah bump");
console.log(`bump-version: ${cur} → ${next} OK (VERSION, package.json, lockfile, README, CHANGELOG)`);
console.log("berikutnya: isi catatan rilis di CHANGELOG.md, lalu npm run validate && npm test");
