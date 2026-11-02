/**
 * `lumitome update` — perbarui KODE Lumitome (bukan engine OpenCode) ke tag rilis terbaru.
 * Mode git (install.sh): ls-remote tag → clone tag ke staging → verifikasi (commit = sha tag, VERSION = tag, opsional --sha)
 *   → siapkan (node_modules, indeks skill) → swap atomik dengan backup → cek pasca-pasang → gagal = rollback otomatis.
 * Mode npm: `npm install -g <tarball tag>` (output npm hanya ke log).
 * Sesudahnya (diam-diam): migrasi config, service latar milik LUMI_HOME dihentikan (mulai lagi saat lumitome dibuka).
 * Tampilan: lihat update-ui.mjs. Detail teknis hanya di ~/.lumitome/logs/update.log, atau di layar dengan --verbose / LUMI_DEBUG=1.
 * Engine ($LUMI_HOME/bin/opencode) tidak pernah disentuh. Tanpa auto-update.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { createUI, uiMode } from "./update-ui.mjs";
import { windowsCodepage } from "./provider-ui.mjs";

export const DEFAULT_URL = "https://github.com/fahmi0812/Lumitome.git";
export const TARBALL = (tag) => `https://github.com/fahmi0812/Lumitome/tarball/${tag}`;
const semver = (v) => (String(v).match(/^v?(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
export const cmpVer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const GENV = () => ({ ...process.env, GIT_TERMINAL_PROMPT: "0" });
const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: GENV(), windowsHide: true, ...opts }).trim();

export function parseTags(out) {
  const m = new Map();
  for (const line of String(out).split("\n")) {
    const [sha, ref] = line.split(/\s+/); const r = /^refs\/tags\/(v\d+\.\d+\.\d+)(\^\{\})?$/.exec(ref || ""); if (!r) continue;
    if (r[2] || !m.has(r[1])) m.set(r[1], sha); // ^{} (commit ter-peel) menang atas objek tag anotasi
  }
  return [...m].map(([tag, sha]) => ({ tag, sha })).sort((a, b) => cmpVer(a.tag, b.tag));
}
/** Daftar tag rilis remote: [{tag, sha(commit)}], urut naik. */
export function remoteTags(url) { return parseTags(git(["ls-remote", "--tags", url])); }

/** Instalasi npm? (tanpa .git, LUMI_INSTALL=npm atau di dalam node_modules) */
export function isNpmInstall(repo, env = process.env, exists = fs.existsSync) {
  if (exists(path.join(repo, ".git"))) return false;
  return env.LUMI_INSTALL === "npm" || repo.split(/[\\/]/).includes("node_modules");
}

/** Jalankan perintah async (spinner tetap jalan); stdout+stderr ke log. Reject dengan .detail. */
export function run(cmd, args, { cwd, env = process.env, log = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    log(`$ ${cmd} ${args.join(" ")}`);
    let out = "", child;
    try { child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: process.platform === "win32" && /^(npm|npx)$/.test(cmd) }); }
    catch (e) { e.detail = e.message; return reject(e); }
    const take = (b) => { const t = b.toString(); out += t; log(t.replace(/\s+$/, "")); };
    child.stdout.on("data", take); child.stderr.on("data", take);
    child.on("error", (e) => { e.detail = `${e.message}\n${out}`; reject(e); });
    child.on("close", (code) => code === 0 ? resolve(out.trim()) : reject(Object.assign(new Error(`${cmd} exit ${code}`), { detail: out.trim(), code })));
  });
}

function makeLog(home, verbose, out = process.stderr) {
  let fd = null;
  try { const d = path.join(home, "logs"); fs.mkdirSync(d, { recursive: true }); fd = fs.openSync(path.join(d, "update.log"), "a"); fs.writeSync(fd, `\n=== ${new Date().toISOString()} ===\n`); } catch {}
  const f = (s) => { const t = String(s); if (fd !== null) try { fs.writeSync(fd, t + "\n"); } catch {} if (verbose) out.write(`  ${t}\n`); };
  f.close = () => { if (fd !== null) try { fs.closeSync(fd); } catch {} };
  return f;
}

async function confirm(q, out = process.stderr) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: out });
  const a = await new Promise((r) => rl.question(q, r)); rl.close(); return !/^(n|no|t|tidak)$/i.test(a.trim());
}

/** Setelah update: migrasi config & hentikan service lama milik LUMI_HOME (diam-diam; gagal tidak fatal). */
async function afterUpdate({ repo, home, log }) {
  try { const mf = path.join(repo, "lumitome", "lib", "config-migrate.mjs");
    if (fs.existsSync(mf)) { const M = await import(pathToFileURL(mf).href); if (M.migrateConfigFile(path.join(home, "config", "opencode.jsonc"))) log("config dimigrasi"); } } catch (e) { log(`migrasi: ${e.message}`); }
  try { const sf = path.join(repo, "lumitome", "lib", "service-ctl.mjs");
    if (fs.existsSync(sf)) { const S = await import(pathToFileURL(sf).href); if (S.stop(home)) log("service lama dihentikan"); } } catch (e) { log(`service: ${e.message}`); }
}

export async function update({ argv, version, repo, home, env = process.env, out = process.stderr, ui, runImpl = run, tagsImpl }) {
  const flag = (f) => argv.includes(f), val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const verbose = flag("--verbose") || !!env.LUMI_DEBUG;
  ui ||= createUI({ out, mode: uiMode({ env, isTTY: !!out.isTTY, codepage: await windowsCodepage() }) });
  const log = makeLog(home, verbose, out);
  const R = (cmd, args, o = {}) => runImpl(cmd, args, { log, env: cmd === "git" ? GENV() : env, ...o });
  const fail = (msg, hint, e) => { if (e) log(`ERROR: ${e.detail || e.message || e}`); ui.fail(msg, hint ?? (verbose ? null : "Detail: lumitome update --verbose")); log.close(); return 1; };
  const npm = isNpmInstall(repo, env);
  const bdir = path.join(home, "backups");
  ui.logo();
  if (flag("--rollback")) {
    if (npm) return fail("Rollback tidak tersedia untuk instalasi npm.", `Pasang versi lama: npm install -g ${TARBALL("v<versi>")}`);
    const r = rollback({ repo, bdir });
    if (!r) return fail("Belum ada versi sebelumnya untuk dipulihkan.");
    ui.done("Dikembalikan ke versi sebelumnya"); log(`rollback dari ${r}`); log.close(); return 0;
  }

  let url = env.LUMI_UPDATE_URL;
  if (!url && !npm) { try { url = git(["-C", repo, "remote", "get-url", "origin"]); } catch { url = DEFAULT_URL; } }
  url ||= DEFAULT_URL;
  ui.step("Memeriksa");
  let tags;
  try { tags = tagsImpl ? await tagsImpl(url) : parseTags(await R("git", ["ls-remote", "--tags", url])); }
  catch (e) { return fail("Tidak bisa memeriksa versi terbaru.", "Cek koneksi internet, lalu coba lagi.", e); }
  if (!tags.length) return fail("Tidak ada rilis yang ditemukan.");
  const want = val("--to"); const target = want ? tags.find((t) => t.tag === (want.startsWith("v") ? want : `v${want}`)) : tags[tags.length - 1];
  if (!target) return fail(`Versi ${want} tidak ditemukan.`, "Lihat daftar rilis di GitHub.");
  log(`kini v${version}; target ${target.tag} (${target.sha}) dari ${url}; mode ${npm ? "npm" : "git"}`);
  const newer = cmpVer(target.tag, version) > 0;
  if (flag("--check")) {
    newer ? ui.calm(`Versi baru tersedia: ${target.tag} (sekarang v${version}). Jalankan: lumitome update`) : ui.calm(`Sudah versi terbaru — v${version}`);
    log.close(); return 0;
  }
  if (!newer && !flag("--force")) { ui.calm(`Sudah versi terbaru — v${version}`); log.close(); return 0; }
  if (!npm && (!fs.existsSync(path.join(repo, ".git")) || !fs.existsSync(path.join(home, ".lumitome-home")) || path.relative(home, repo).startsWith("..")))
    return fail("Folder ini bukan instalasi Lumitome.", "Untuk checkout pengembangan, perbarui dengan git.", `repo=${repo} home=${home}`);
  if (!flag("--yes")) {
    ui.stop();
    if (!process.stdin.isTTY) return fail("Butuh konfirmasi.", "Jalankan: lumitome update --yes");
    if (!(await confirm(`  Perbarui ke ${target.tag}? (Y/n) `, out))) { ui.calm("Dibatalkan."); log.close(); return 2; }
  }

  if (npm) {
    ui.step("Mengunduh");
    const t = setTimeout(() => ui.step("Memasang"), 4000); t.unref?.();
    try { await R("npm", ["install", "-g", "--no-audit", "--no-fund", "--loglevel=error", TARBALL(target.tag)]); }
    catch (e) { clearTimeout(t); return fail("Pemasangan gagal.", `Coba lagi, atau: npm install -g ${TARBALL(target.tag)}`, e); }
    clearTimeout(t);
    ui.step("Merapikan");
    await afterUpdate({ repo, home, log });
    ui.done(`Selesai — ${target.tag}`); log.close(); return 0;
  }

  const stage = path.join(home, `.update-${target.tag}-${process.pid}`);
  fs.rmSync(stage, { recursive: true, force: true });
  const failStage = (msg, hint, e) => { fs.rmSync(stage, { recursive: true, force: true }); return fail(msg, hint, e); };
  ui.step("Mengunduh");
  try { await R("git", ["clone", "-q", "--depth", "1", "--branch", target.tag, url, stage]); }
  catch (e) { return failStage("Unduhan gagal.", "Cek koneksi internet, lalu coba lagi.", e); }
  ui.step("Memasang");
  // verifikasi: commit hasil clone = sha tag di remote; VERSION = tag; opsional pin --sha
  const head = git(["-C", stage, "rev-parse", "HEAD"]);
  if (head !== target.sha) return failStage("Verifikasi rilis gagal.", "Tidak ada yang diubah.", `HEAD ${head} != tag ${target.sha}`);
  const pin = val("--sha"); if (pin && !head.startsWith(pin)) return failStage("Verifikasi rilis gagal.", "Tidak ada yang diubah.", `commit ${head} != --sha ${pin}`);
  const sver = fs.readFileSync(path.join(stage, "VERSION"), "utf8").trim();
  if (`v${sver}` !== target.tag) return failStage("Verifikasi rilis gagal.", "Tidak ada yang diubah.", `VERSION ${sver} != ${target.tag}`);
  log(`terverifikasi ${target.tag} @ ${head}`);
  const nm = path.join(repo, "node_modules");
  const sameDeps = (f) => { try { return fs.readFileSync(path.join(repo, f), "utf8") === fs.readFileSync(path.join(stage, f), "utf8"); } catch { return false; } };
  try {
    if (fs.existsSync(nm)) {
      if (sameDeps("package-lock.json") || (sameDeps("package.json") && !fs.existsSync(path.join(stage, "package-lock.json")))) fs.cpSync(nm, path.join(stage, "node_modules"), { recursive: true, verbatimSymlinks: true });
      else await R("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: stage });
    }
    await R(process.execPath, ["--no-warnings", "scripts/skill-index.mjs"], { cwd: stage });
  } catch (e) { return failStage("Persiapan gagal.", "Tidak ada yang diubah.", e); }
  // swap atomik: repo → backup, staging → repo
  fs.mkdirSync(bdir, { recursive: true });
  const bak = path.join(bdir, `src-v${version}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.renameSync(repo, bak);
  try { fs.renameSync(stage, repo); } catch (e) { fs.renameSync(bak, repo); return failStage("Pemasangan gagal.", "Versi lama dipertahankan.", e); }
  // cek pasca-pasang; gagal → rollback
  let okv = false, chkOut = "";
  try { chkOut = await R(process.execPath, [path.join(repo, "lumitome/bin/lumitome.mjs"), "--version"], { env: { ...env, LUMI_HOME: home } }); okv = chkOut.includes(`lumitome ${sver} `); } catch (e) { chkOut = e.detail || e.message; }
  if (!okv || env.LUMI_UPDATE_FAIL_INJECT === "post") {
    fs.renameSync(repo, `${bak}.failed`); fs.renameSync(bak, repo); fs.rmSync(`${bak}.failed`, { recursive: true, force: true });
    return fail("Versi baru tidak bisa dijalankan; dikembalikan ke versi lama.", null, `cek pasca-pasang: ${chkOut || "inject"}`);
  }
  // simpan 2 backup terbaru
  const olds = fs.readdirSync(bdir).filter((d) => d.startsWith("src-v")).sort(); for (const d of olds.slice(0, Math.max(0, olds.length - 2))) fs.rmSync(path.join(bdir, d), { recursive: true, force: true });
  ui.step("Merapikan");
  await afterUpdate({ repo, home, log });
  const ocPin = (fs.readFileSync(path.join(repo, "install.sh"), "utf8").match(/^OC_VERSION=([\d.]+)/m) || [])[1];
  log(`OK v${version} -> ${target.tag}; backup ${bak}; engine tidak diubah${ocPin ? ` (pin ${ocPin})` : ""}`);
  ui.done(`Selesai — ${target.tag}`); log.close(); return 0;
}

/** Pulihkan backup terbaru; return nama backup atau null. */
export function rollback({ repo, bdir }) {
  const b = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter((d) => /^src-v[\d.]+-/.test(d) && !d.endsWith(".failed")).sort().pop() : null;
  if (!b) return null;
  const cur = `${repo}.rolledback-${process.pid}`;
  fs.renameSync(repo, cur); fs.renameSync(path.join(bdir, b), repo); fs.rmSync(cur, { recursive: true, force: true });
  return b;
}
