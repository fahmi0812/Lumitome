/**
 * Cek konsistensi versi single-source (v0.3.21, diperluas v0.3.47 P2-2).
 * Kanonik: file VERSION. Yang dicek: VERSION vs package.json vs README
 * (badge + tarball) vs CHANGELOG (ada entri ## <versi> yang sudah diisi,
 * bukan placeholder TODO dari bump-version) vs package-lock.json (versi root,
 * bila file ada — rilis manual pernah meninggalkan lockfile basi, v0.3.80/81).
 * Dipakai scripts/validate.mjs (node polos) — jadi modul ini .mjs murni,
 * tanpa impor dari harness/*.ts. Pasangan in-memory-nya untuk detektor
 * drift/done-gate ada di harness/doc-drift.ts (detectVersionDrift).
 */
import fs from "node:fs";
import path from "node:path";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Kembalikan daftar pesan error (kosong = konsisten). Tidak pernah throw untuk file hilang — itu juga error. */
export function checkVersionConsistency(root = ".") {
  const errors = [];
  const read = (f) => {
    try { return fs.readFileSync(path.join(root, f), "utf8"); }
    catch { errors.push(`${f} tidak ditemukan`); return null; }
  };
  const verText = read("VERSION");
  const v = verText === null ? null : verText.trim();
  if (v !== null && !/^\d+\.\d+\.\d+$/.test(v)) errors.push(`VERSION '${v}' bukan x.y.z`);
  if (v === null) return errors;
  const pkgText = read("package.json");
  if (pkgText !== null) {
    let pkg;
    try { pkg = JSON.parse(pkgText); } catch { errors.push("package.json bukan JSON valid"); }
    if (pkg && pkg.version !== v) errors.push(`package.json versi ${pkg.version} != VERSION ${v}`);
  }
  const rm = read("README.md");
  if (rm !== null) {
    if (!rm.includes(`version-${v}`)) errors.push(`README badge bukan version-${v} (VERSION ${v})`);
    if (!rm.includes(`refs/tags/v${v}.tar.gz`)) errors.push(`README tarball bukan refs/tags/v${v}.tar.gz (VERSION ${v})`);
  }
  // package-lock.json opsional: hanya dicek bila ada (fixture versi tidak punya
  // lockfile). Versi root muncul dua tempat di lockfileVersion 3: `version`
  // top-level dan packages[""].version — keduanya harus sama dengan VERSION.
  if (fs.existsSync(path.join(root, "package-lock.json"))) {
    const lockText = read("package-lock.json");
    if (lockText !== null) {
      let lock;
      try { lock = JSON.parse(lockText); } catch { errors.push("package-lock.json bukan JSON valid"); }
      if (lock) {
        if (lock.version !== v) errors.push(`package-lock.json versi ${lock.version} != VERSION ${v}`);
        const rootPkg = lock.packages && lock.packages[""];
        if (rootPkg && rootPkg.version !== v) errors.push(`package-lock.json packages[""] versi ${rootPkg.version} != VERSION ${v}`);
      }
    }
  }
  const cl = read("CHANGELOG.md");
  if (cl !== null) {
    const m = new RegExp(`^## ${esc(v)}(?:\\s|$)`, "m").exec(cl);
    if (!m) errors.push(`CHANGELOG.md tanpa entri ## ${v} (VERSION ${v})`);
    else {
      const rest = cl.slice(m.index + m[0].length);
      const next = /^## \d+\.\d+\.\d+/m.exec(rest);
      const section = next ? rest.slice(0, next.index) : rest;
      if (/TODO: isi catatan rilis/.test(section)) errors.push(`CHANGELOG.md entri ## ${v} masih placeholder TODO: isi catatan rilis`);
    }
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errs = checkVersionConsistency(process.argv[2] || ".");
  if (errs.length) { for (const e of errs) console.error("[FAIL]", e); process.exit(1); }
  console.log("[PASS] versi konsisten (VERSION = package.json = package-lock.json = README = CHANGELOG)");
}
