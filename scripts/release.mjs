#!/usr/bin/env node
/**
 * Gate rilis Lumitome (P0-2, v0.3.40) — SATU perintah rilis yang dieksekusi.
 * Pakai: node scripts/release.mjs <x.y.z> [--allow-skipped "alasan"] [--include <file> ...]
 *
 * Urutan, berhenti di kegagalan pertama:
 *   (1) CHANGELOG.md tidak boleh berisi `- TODO: isi catatan rilis`; `git status`
 *       tidak boleh kotor di luar file rilis (VERSION, package.json,
 *       package-lock.json, README.md, CHANGELOG.md) + file yang disebut
 *       eksplisit lewat --include (dicetak di laporan, bukan diam-diam).
 *   (2) `npm run validate` lalu `npm test` — gagal → berhenti, bukan lanjut.
 *   (3) Jumlah `[SKIP]` dari output suite dilaporkan; ada yang ter-skip tanpa
 *       `--allow-skipped "alasan"` → rilis DITOLAK. Flag itu bukan pelemahan
 *       gate: alasan tertulis dicetak di laporan.
 *   (4) Pemeriksaan updater pra-tag di salinan staging pohon kerja: VERSION
 *       staging == versi rilis, `lumitome --version` staging menyebut versi
 *       itu (cek pasca-pasang yang sama dengan updater), dan
 *       `scripts/skill-index.mjs` jalan di staging (langkah persiapan updater).
 *       Simulasi updater PENUH (clone tag dari remote → swap → --version)
 *       TIDAK MUNGKIN sebelum tag ada di remote — skrip ini TIDAK PERNAH
 *       mengklaim simulasi itu sudah jalan; ia mencetak perintah persis yang
 *       harus dijalankan manusia setelah tag terbit.
 *
 * BATAS MENGIKAT: skrip ini HANYA memeriksa + menyiapkan. Ia TIDAK PERNAH
 * commit, tag, atau push (pengiriman di proyek ini lewat connector
 * snapshot-push, bukan git commit lokal). Keputusan akhir tetap manusia;
 * langkah berikut dicetak di akhir, bukan dijalankan.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_FILES = ["VERSION", "package.json", "package-lock.json", "README.md", "CHANGELOG.md"];
export const TODO_PLACEHOLDER = "- TODO: isi catatan rilis";
export const REPO_URL = "https://github.com/fahmi0812/Lumitome.git";
export const TARBALL = (tag) => `https://github.com/fahmi0812/Lumitome/tarball/${tag}`;
const USAGE = 'pakai: node scripts/release.mjs <x.y.z> [--allow-skipped "alasan"] [--include <file> ...]';

/** Apakah CHANGELOG masih berisi placeholder catatan rilis dari bump-version.
 *  Dicocokkan per BARIS utuh (persis yang ditulis bump-version), bukan substring:
 *  entri changelog yang MENYEBUT placeholder di tengah kalimat prosa bukan
 *  placeholder yang tertinggal. */
export function hasTodoPlaceholder(text) {
  return String(text).split("\n").some((l) => l.trim() === TODO_PLACEHOLDER);
}

/** Path file dari output `git status --porcelain` (rename -> nama baru). */
export function parseStatus(out) {
  return String(out).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.slice(2).trim();
    const arrow = p.indexOf(" -> ");
    return arrow >= 0 ? p.slice(arrow + 4) : p;
  });
}

/** File kotor di luar daftar yang diizinkan. */
export function dirtyOutside(files, allowed) {
  const set = new Set(allowed);
  return files.filter((f) => !set.has(f));
}

/** Hitung baris `[SKIP]` di output suite (tes ter-skip, bukan tes gagal).
 *  Hanya baris yang DIAWALI `[SKIP]` (yang dicetak suite saat tes dilewati);
 *  nama tes yang sekadar menyebut "[SKIP]" di tengah baris bukan skip. */
export function countSkips(output) {
  const lines = String(output).split("\n").filter((l) => l.trimStart().startsWith("[SKIP]"));
  return { count: lines.length, lines };
}

export function parseReleaseArgs(argv) {
  const version = argv[0];
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error(USAGE);
  const out = { version, allowSkipped: false, reason: "", includes: [] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--allow-skipped") {
      const r = argv[i + 1];
      if (!r || r.startsWith("--")) throw new Error(`--allow-skipped butuh alasan tertulis: ${USAGE}`);
      out.allowSkipped = true; out.reason = r; i++;
    } else if (argv[i] === "--include") {
      const f = argv[i + 1];
      if (!f || f.startsWith("--")) throw new Error(`--include butuh nama file: ${USAGE}`);
      out.includes.push(f); i++;
    } else {
      throw new Error(`argumen tidak dikenal: ${argv[i]} — ${USAGE}`);
    }
  }
  return out;
}

/** Jalankan perintah sambil menampilkan outputnya langsung + menangkapnya. */
function runStreaming(cmd, args, { cwd, out }) {
  return new Promise((resolve) => {
    let stdout = "", stderr = "";
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: process.platform === "win32" && /^(npm|npx)$/.test(cmd) });
    child.stdout.on("data", (b) => { const t = b.toString(); stdout += t; out.write(t); });
    child.stderr.on("data", (b) => { const t = b.toString(); stderr += t; out.write(t); });
    child.on("error", (e) => resolve({ status: 1, stdout, stderr: stderr + e.message }));
    child.on("close", (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

/**
 * Pemeriksaan updater pra-tag di salinan staging: VERSION staging == versi
 * rilis, `lumitome --version` staging menyebut versi itu (cek pasca-pasang
 * yang sama dipakai updater), dan persiapan skill-index jalan di staging.
 * BUKAN simulasi updater penuh — lihat catatan di header file.
 */
export async function verifyStaging({ stageDir, version, run, out }) {
  const failures = [];
  let sver = "";
  try { sver = fs.readFileSync(path.join(stageDir, "VERSION"), "utf8").trim(); }
  catch (e) { failures.push(`VERSION tidak terbaca di staging: ${e.message}`); }
  if (sver && sver !== version) failures.push(`VERSION staging ${sver} != ${version}`);
  else if (sver) out.write(`  staging: VERSION ${sver} OK\n`);
  const v = await run(process.execPath, ["lumitome/bin/lumitome.mjs", "--version"], { cwd: stageDir });
  if (v.status !== 0) failures.push(`lumitome --version di staging exit ${v.status}`);
  else if (!v.stdout.includes(`lumitome ${version} `)) failures.push(`lumitome --version staging tidak menyebut v${version}: ${JSON.stringify(v.stdout.trim())}`);
  else out.write(`  staging: lumitome --version menyebut v${version} OK\n`);
  const si = await run(process.execPath, ["scripts/skill-index.mjs"], { cwd: stageDir });
  if (si.status !== 0) failures.push(`skill-index di staging exit ${si.status}`);
  else out.write("  staging: skill-index OK\n");
  return { ok: failures.length === 0, failures };
}

/** Salinan staging pohon kerja (termasuk perubahan belum commit) di direktori
 *  saudara repo (bukan di dalam repo: cpSync menolak menyalin direktori ke
 *  subdirektori dirinya sendiri; bukan os.tmpdir(): /tmp di VM ini tmpfs 512M
 *  sedangkan pohon kerja ~331M). Selalu dibersihkan pemanggil (finally). */
async function makeStageReal(cwd) {
  const stageDir = path.join(path.dirname(cwd), `.lumitome-release-stage-${process.pid}`);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.cpSync(cwd, stageDir, { recursive: true, filter: (src) => {
    const rel = path.relative(cwd, src);
    if (!rel) return true;
    const seg = rel.split(path.sep);
    return !seg.includes(".git") && !seg.includes("runtime") && !seg.includes(".tmp") && !seg.includes("backups");
  } });
  return { stageDir, cleanup: () => fs.rmSync(stageDir, { recursive: true, force: true }) };
}

/**
 * Orkestrasi gate rilis. `io` bisa di-inject (dipakai tes): readText(path),
 * gitStatus() -> porcelain, run(cmd, args, {cwd}) -> {status, stdout, stderr},
 * makeStage() -> {stageDir, cleanup}. Return 0 lolos, 1 gate gagal, 2 pemakaian salah.
 */
export async function releaseGate({ argv, cwd = process.cwd(), out = process.stdout, readText, gitStatus, run, makeStage }) {
  const w = (s) => out.write(s);
  let args;
  try { args = parseReleaseArgs(argv); }
  catch (e) { w(`release: ${e.message}\n`); return 2; }
  const version = args.version;
  const fail = (msg) => { w(`release: DITOLAK — ${msg}\n`); return 1; };
  w(`release: gate rilis v${version}\n`);

  // (1) placeholder CHANGELOG + git status kotor di luar file rilis.
  let cur = "";
  try { cur = readText("VERSION").trim(); } catch (e) { return fail(`VERSION tidak terbaca: ${e.message}`); }
  if (cur !== version) return fail(`VERSION berisi ${cur || "(kosong)"}, bukan ${version} — jalankan bump-version dulu`);
  let changelog = "";
  try { changelog = readText("CHANGELOG.md"); } catch (e) { return fail(`CHANGELOG.md tidak terbaca: ${e.message}`); }
  if (hasTodoPlaceholder(changelog)) return fail(`CHANGELOG.md masih berisi "${TODO_PLACEHOLDER}" — isi catatan rilis dulu`);
  w("[1/4] CHANGELOG tanpa placeholder TODO: OK\n");
  let statusOut = "";
  try { statusOut = await gitStatus(); } catch (e) { return fail(`git status gagal: ${e.message}`); }
  const files = parseStatus(statusOut);
  const allowed = [...RELEASE_FILES, ...args.includes];
  const dirty = dirtyOutside(files, allowed);
  if (dirty.length) return fail(`git status kotor di luar file rilis: ${dirty.join(", ")} — commit/pisahkan dulu, atau izinkan eksplisit dengan --include`);
  if (args.includes.length) w(`  file tambahan diizinkan (--include): ${args.includes.join(", ")}\n`);
  w(`[1/4] git status bersih di luar file rilis (${files.length} file rilis): OK\n`);

  // (2) validate lalu test — gagal → berhenti.
  w("[2/4] npm run validate…\n");
  const val = await run("npm", ["run", "validate"], { cwd });
  if (val.status !== 0) return fail("npm run validate gagal — perbaiki dulu, rilis berhenti di sini");
  w("[2/4] npm run validate: OK\n");
  w("[2/4] npm test…\n");
  const tst = await run("npm", ["test"], { cwd });
  if (tst.status !== 0) return fail("npm test gagal — perbaiki dulu, rilis berhenti di sini");
  w("[2/4] npm test: OK\n");

  // (3) laporkan [SKIP]; tanpa --allow-skipped + alasan → tolak.
  const skips = countSkips(`${tst.stdout}\n${tst.stderr}`);
  if (skips.count > 0 && !args.allowSkipped) {
    return fail(`${skips.count} tes ter-skip tanpa --allow-skipped:\n${skips.lines.map((l) => `  ${l}`).join("\n")}\n  Beri flag --allow-skipped "alasan" bila skip itu memang karena lingkungan, bukan karena tes dilewati`);
  }
  w(`[3/4] ${skips.count} tes ter-skip${skips.count > 0 ? ` (diizinkan, alasan: ${args.reason})` : ""}\n`);
  for (const l of skips.lines) w(`  ${l}\n`);

  // (4) pemeriksaan updater pra-tag di staging; simulasi penuh tetap tugas manusia.
  // Gate tidak boleh crash di langkah ini: kegagalan staging = verdict DITOLAK.
  w("[4/4] pemeriksaan updater pra-tag (salinan staging)…\n");
  let stage;
  try { stage = await makeStage(); }
  catch (e) { return fail(`salinan staging gagal dibuat: ${e.message}`); }
  let ver;
  try { ver = await verifyStaging({ stageDir: stage.stageDir, version, run, out }); }
  catch (e) { return fail(`pemeriksaan updater pra-tag gagal: ${e.message}`); }
  finally { stage.cleanup(); }
  if (!ver.ok) return fail(`pemeriksaan updater pra-tag gagal:\n${ver.failures.map((f) => `  ${f}`).join("\n")}`);
  w("[4/4] pemeriksaan updater pra-tag: OK\n");

  w(`\nrelease: LOLOS — v${version} siap dirilis. Keputusan akhir tetap manusia.\n`);
  w("  Skrip ini TIDAK PERNAH commit/tag/push. Langkah berikut (manusia/koordinator):\n");
  w(`    git add ${files.join(" ")}\n`);
  w(`    git commit -m "v${version}: <judul rilis>"\n`);
  w(`    git tag v${version}\n`);
  w("    (pengiriman di proyek ini lewat connector snapshot-push, bukan git commit lokal)\n");
  w(`    gh release create v${version} --title "v${version}" --notes-file <catatan rilis>\n`);
  w(`  SIMULASI PENUH BELUM JALAN — tag v${version} belum ada di remote, jadi\n`);
  w("  updater belum bisa diuji ujung-ke-ujung dari tag itu. Setelah tag terbit,\n  jalankan simulasi updater penuh sebelum mengumumkan rilis:\n");
  w(`    git clone --depth 1 --branch v${version} ${REPO_URL} /tmp/lumi-sim-${version}\n`);
  w(`    cd /tmp/lumi-sim-${version} && node lumitome/bin/lumitome.mjs --version\n`);
  w(`    # atau di instalasi Lumitome staging: lumitome update --to v${version} --yes\n`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cwd = process.cwd();
  const out = { write: (s) => process.stdout.write(s) };
  const code = await releaseGate({
    argv: process.argv.slice(2),
    cwd,
    out,
    readText: (p) => fs.readFileSync(path.join(cwd, p), "utf8"),
    gitStatus: () => execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }),
    run: (cmd, args, opts) => runStreaming(cmd, args, { ...opts, out }),
    makeStage: () => makeStageReal(cwd),
  });
  process.exit(code);
}
