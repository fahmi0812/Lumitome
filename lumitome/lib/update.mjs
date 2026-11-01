/**
 * `lumitome update` — perbarui KODE Lumitome (bukan engine OpenCode) ke tag rilis terbaru.
 * Alur: ls-remote tag vX.Y.Z → pilih tertinggi → clone --branch tag ke staging → verifikasi (commit = sha tag remote,
 * VERSION = tag, opsional --sha) → siapkan (node_modules, indeks skill) → swap atomik (rename) dengan backup →
 * cek pasca-pasang (`--version`) → gagal = rollback otomatis. Engine ($LUMI_HOME/bin/opencode) tidak pernah disentuh.
 * Tanpa auto-update: hanya berjalan bila dipanggil; tanpa --yes minta konfirmasi (TTY) atau berhenti.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DEFAULT_URL = "https://github.com/fahmi0812/Lumitome.git";
const semver = (v) => (String(v).match(/^v?(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
export const cmpVer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, ...opts }).trim();

/** Daftar tag rilis remote: [{tag, sha(commit)}], urut naik. */
export function remoteTags(url) {
  const out = git(["ls-remote", "--tags", url]); const m = new Map();
  for (const line of out.split("\n")) {
    const [sha, ref] = line.split(/\s+/); const r = /^refs\/tags\/(v\d+\.\d+\.\d+)(\^\{\})?$/.exec(ref || ""); if (!r) continue;
    if (r[2] || !m.has(r[1])) m.set(r[1], sha); // ^{} (commit ter-peel) menang atas objek tag anotasi
  }
  return [...m].map(([tag, sha]) => ({ tag, sha })).sort((a, b) => cmpVer(a.tag, b.tag));
}

async function confirm(q) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const a = await new Promise((r) => rl.question(q, r)); rl.close(); return /^(y|ya|yes)$/i.test(a.trim());
}

export async function update({ argv, version, repo, home, log = console.log, err = (m) => process.stderr.write(m + "\n") }) {
  const flag = (f) => argv.includes(f), val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  let url = process.env.LUMI_UPDATE_URL;
  if (!url) { try { url = git(["-C", repo, "remote", "get-url", "origin"]); } catch { url = DEFAULT_URL; } }
  const bdir = path.join(home, "backups");
  if (flag("--rollback")) return rollback({ repo, bdir, log, err });
  let tags; try { tags = remoteTags(url); } catch (e) { err(`update: gagal membaca tag dari ${url}: ${String(e.stderr || e.message).trim().split("\n").pop()}`); return 1; }
  if (!tags.length) { err(`update: tidak ada tag rilis vX.Y.Z di ${url}`); return 1; }
  const want = val("--to"); const target = want ? tags.find((t) => t.tag === (want.startsWith("v") ? want : `v${want}`)) : tags[tags.length - 1];
  if (!target) { err(`update: tag ${want} tidak ada di ${url}`); return 1; }
  const newer = cmpVer(target.tag, version) > 0;
  log(`lumitome kini: v${version}\nrilis ${want ? "diminta" : "terbaru"}: ${target.tag} (${target.sha.slice(0, 12)}) dari ${url}`);
  if (flag("--check")) { log(newer ? `update tersedia: v${version} → ${target.tag}. Jalankan: lumitome update` : "sudah versi terbaru"); return 0; }
  if (!newer && !flag("--force")) { log("sudah versi terbaru (pakai --to <versi> --force untuk pasang ulang/turun versi)"); return 0; }
  if (!fs.existsSync(path.join(repo, ".git")) || !fs.existsSync(path.join(home, ".lumitome-home")) || path.relative(home, repo).startsWith("..")) {
    err(`update: ${repo} bukan instalasi Lumitome di ${home} (dev checkout?) — perbarui dengan git sendiri`); return 2; }
  if (!flag("--yes") && !(await confirm(`Perbarui Lumitome v${version} → ${target.tag}? Engine OpenCode TIDAK diubah. [y/N] `))) { err("update: dibatalkan (pakai --yes untuk non-interaktif)"); return 2; }

  const stage = path.join(home, `.update-${target.tag}-${process.pid}`);
  fs.rmSync(stage, { recursive: true, force: true });
  const fail = (m) => { fs.rmSync(stage, { recursive: true, force: true }); err(`update: ${m}`); return 1; };
  try { git(["clone", "-q", "--depth", "1", "--branch", target.tag, url, stage]); } catch (e) { return fail(`unduh gagal: ${String(e.stderr || e.message).trim()}`); }
  // verifikasi: commit hasil clone = sha tag di remote; VERSION = tag; opsional pin --sha
  const head = git(["-C", stage, "rev-parse", "HEAD"]);
  if (head !== target.sha) return fail(`verifikasi gagal: HEAD ${head} ≠ tag ${target.sha}`);
  const pin = val("--sha"); if (pin && !head.startsWith(pin)) return fail(`verifikasi gagal: commit ${head} ≠ --sha ${pin}`);
  const sver = fs.readFileSync(path.join(stage, "VERSION"), "utf8").trim();
  if (`v${sver}` !== target.tag) return fail(`verifikasi gagal: VERSION ${sver} ≠ ${target.tag}`);
  log(`terverifikasi: ${target.tag} @ ${head}`);
  // persiapan di staging (sebelum swap): node_modules & indeks skill
  const nm = path.join(repo, "node_modules");
  const sameDeps = (f) => { try { return fs.readFileSync(path.join(repo, f), "utf8") === fs.readFileSync(path.join(stage, f), "utf8"); } catch { return false; } };
  if (fs.existsSync(nm)) {
    if (sameDeps("package-lock.json") || (sameDeps("package.json") && !fs.existsSync(path.join(stage, "package-lock.json")))) fs.cpSync(nm, path.join(stage, "node_modules"), { recursive: true, verbatimSymlinks: true });
    else { const r = spawnSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: stage, stdio: "inherit" }); if (r.status !== 0) return fail("npm ci gagal"); }
  }
  const ix = spawnSync(process.execPath, ["--no-warnings", "scripts/skill-index.mjs"], { cwd: stage, encoding: "utf8" });
  if (ix.status !== 0) return fail(`indeks skill gagal: ${(ix.stderr || "").trim().slice(0, 300)}`);
  // swap atomik: repo → backup, staging → repo
  fs.mkdirSync(bdir, { recursive: true });
  const bak = path.join(bdir, `src-v${version}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.renameSync(repo, bak);
  try { fs.renameSync(stage, repo); } catch (e) { fs.renameSync(bak, repo); return fail(`swap gagal (${e.message}); dikembalikan`); }
  // cek pasca-pasang; gagal → rollback
  const chk = spawnSync(process.execPath, [path.join(repo, "lumitome/bin/lumitome.mjs"), "--version"], { encoding: "utf8", env: { ...process.env, LUMI_HOME: home } });
  const okv = chk.status === 0 && chk.stdout.includes(`lumitome ${sver} `);
  if (!okv || process.env.LUMI_UPDATE_FAIL_INJECT === "post") {
    fs.renameSync(repo, `${bak}.failed`); fs.renameSync(bak, repo); fs.rmSync(`${bak}.failed`, { recursive: true, force: true });
    err(`update: cek pasca-pasang gagal (${(chk.stdout + chk.stderr).trim().slice(0, 200) || "inject"}) → ROLLBACK ke v${version}`); return 1;
  }
  // simpan 2 backup terbaru
  const olds = fs.readdirSync(bdir).filter((d) => d.startsWith("src-v")).sort(); for (const d of olds.slice(0, Math.max(0, olds.length - 2))) fs.rmSync(path.join(bdir, d), { recursive: true, force: true });
  const ocPin = (fs.readFileSync(path.join(repo, "install.sh"), "utf8").match(/^OC_VERSION=([\d.]+)/m) || [])[1];
  log(`OK: lumitome v${version} → ${target.tag}. Backup: ${bak}\nengine OpenCode tidak diubah${ocPin ? ` (rilis ini mem-pin v${ocPin}; bila beda, jalankan: lumitome upgrade-engine ${ocPin} --sha256 <hash>)` : ""}. Batal: lumitome update --rollback`);
  return 0;
}

function rollback({ repo, bdir, log, err }) {
  const b = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter((d) => /^src-v[\d.]+-/.test(d) && !d.endsWith(".failed")).sort().pop() : null;
  if (!b) { err("update --rollback: tidak ada backup"); return 1; }
  const cur = `${repo}.rolledback-${process.pid}`;
  fs.renameSync(repo, cur); fs.renameSync(path.join(bdir, b), repo); fs.rmSync(cur, { recursive: true, force: true });
  log(`rollback: dipulihkan dari ${b}`); return 0;
}
