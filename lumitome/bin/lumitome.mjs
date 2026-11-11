#!/usr/bin/env node
/**
 * lumitome — CLI harness Lumitome di atas OpenCode v2.
 *  - config dasar: OPENCODE_CONFIG_DIR=lumitome/config (berisi plugin guard)
 *  - override final (menang atas config proyek): OPENCODE_CONFIG_CONTENT
 *  - run: --standalone, model default, headless (ask → deny), jurnal, done-gate, anti-spin, retry timeout, cleanup proses
 * Exit: 0 ok | 1 error opencode | 2 argumen salah | 3 DONE-GATE FAIL | 4 ANTI-SPIN trip | 5 guard tidak termuat | 124 timeout provider
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import readlineMod from "node:readline";
const await_rl = () => readlineMod.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");                 // .../lumitome
const REPO = path.resolve(ROOT, "..");                 // repo Swanwright
const VERSION = fs.readFileSync(path.join(REPO, "VERSION"), "utf8").trim(); // single-source: jangan hardcode (bump via scripts/bump-version.mjs)
const DEFAULT_MODEL = "9router/ag/gemini-3.8-flash-high";
const env = { ...process.env };
const die = (code, msg) => { process.stderr.write(`lumitome: ${msg}\n`); process.exit(code); };

const argv = process.argv.slice(2);
// env terisolasi untuk SEMUA pemanggilan engine (termasuk --version): log/state tidak jatuh ke ~/.local/share/opencode user
const ISO_HOME = env.LUMI_HOME || path.join(os.homedir(), ".lumitome");
const isoEnv = () => ({ ...env, XDG_CONFIG_HOME: path.join(ISO_HOME, "xdg-config"), XDG_DATA_HOME: env.LUMI_XDG_DATA || path.join(ISO_HOME, "data"),
  XDG_STATE_HOME: path.join(ISO_HOME, "state"), XDG_CACHE_HOME: path.join(ISO_HOME, "cache"), OPENCODE_DISABLE_AUTOUPDATE: "1" });
const sub = argv[0] && !argv[0].startsWith("-") ? argv[0] : "";
// v0.3.12: migrasi salinan config lama ("buffer": "20%", {env:NINEROUTER_API_KEY}) — juga terpanggil oleh cek pasca-update
try { const CM0 = await import(pathToFileURL(path.join(ROOT, "lib", "config-migrate.mjs")).href);
  CM0.migrateConfigFile(path.join(ISO_HOME, "config", "opencode.jsonc")); } catch {}
if (argv[0] === "--version" || argv[0] === "-v") {
  let oc = "?"; try { oc = execFileSync(ocBin(), ["--version"], { encoding: "utf8", env: isoEnv() }).trim(); } catch {}
  console.log(`lumitome ${VERSION} (${oc})`); process.exit(0);
}
// subcommand engine yang mengubah binary terpin (self-upgrade/uninstall OpenCode) diblok: engine hanya via upgrade-engine
if (sub === "upgrade" || sub === "uninstall") die(2, `'${sub}' engine OpenCode diblok (engine terpin). Kode Lumitome: lumitome update; engine: lumitome upgrade-engine <versi> --sha256 <hash>; hapus: install.sh --uninstall`);
// ---------- update kode Lumitome (manual; engine tidak disentuh) ----------
if (sub === "update") {
  // git (install.sh) atau npm: keduanya ditangani update.mjs (npm → npm install -g tarball tag, output ke log)
  const { update } = await import(pathToFileURL(path.join(ROOT, "lib", "update.mjs")).href);
  process.exit(await update({ argv: argv.slice(1), version: VERSION, repo: REPO, home: ISO_HOME }));
}
// ---------- trust tier sandbox: lihat/atur tingkat kepercayaan proyek + kunci deploy ----------
if (sub === "trust") {
  const G = await import(pathToFileURL(path.join(REPO, "harness", "lumi-guard.mjs")).href);
  const home = os.homedir();
  const cwd = process.cwd();
  const root = G.detectProjectRoot(cwd, { home });
  const targs = argv.slice(1);
  const showScope = () => {
    const s = G.buildSandboxScope(cwd, { home, lumiHome: ISO_HOME, env });
    console.log(`proyek: ${s.root}\ntier: ${s.tier}\nsumber tier: ${s.tierSource === "env" ? "env LUMI_TRUST_TIER (bukan file trust)" : s.tierSource === "file" ? "file trust" : "default"}\ntulis: ${s.write.join(", ")}\nsandbox: ${s.tier === "strict" ? "bwrap (wajib; gagal bila bubblewrap tidak ada)" : "off (guard saja)"}\nssh: ${s.tier === "trusted" ? "bebas (tier trusted)" : "hanya -i kunci deploy (~/.lumitome/<nama>)"}\ntrust file: ${s.trustFile}`);
  };
  // --deploy-key [nama]: buat keypair ed25519 khusus deploy di LUMI_HOME (bukan ~/.ssh, bukan id_*)
  if (targs.includes("--deploy-key")) {
    const di = targs.indexOf("--deploy-key");
    const name = targs[di + 1] && !targs[di + 1].startsWith("-") ? targs[di + 1] : "deploy-vps";
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.startsWith("id_") || /secret|\.env/i.test(name))
      die(2, "nama kunci tidak valid: huruf/angka/-/_/. saja, jangan diawali id_ (itu pola rahasia)");
    const keyPath = path.join(ISO_HOME, name);
    fs.mkdirSync(ISO_HOME, { recursive: true });
    if (!fs.existsSync(keyPath)) {
      try { execFileSync("ssh-keygen", ["-t", "ed25519", "-f", keyPath, "-N", "", "-C", `lumitome-deploy@${os.hostname()}`], { stdio: "ignore" }); }
      catch { die(1, `ssh-keygen tidak ditemukan — pasang openssh-client, atau buat manual: ssh-keygen -t ed25519 -f ${keyPath}`); }
      try { fs.chmodSync(keyPath, 0o600); } catch {}
      console.log(`kunci deploy dibuat: ${keyPath} (0600)`);
    } else console.log(`kunci sudah ada: ${keyPath}`);
    const pub = fs.readFileSync(keyPath + ".pub", "utf8").trim();
    console.log(`public key — tambahkan ke VPS (~/.ssh/authorized_keys user deploy):\n${pub}\n\nDi VPS, batasi sudo user deploy, contoh /etc/sudoers.d/deploy:\ndeploy ALL=(ALL) NOPASSWD: /bin/systemctl restart <aplikasi>\nPakai di agent: ssh -i ${keyPath} <user>@<vps>`);
    process.exit(0);
  }
  if (targs.length === 0) { showScope(); process.exit(0); }
  const tier = targs[0];
  if (!G.TRUST_TIERS.includes(tier)) die(2, "pakai: lumitome trust [strict|standard|trusted] [--deploy-key [nama]] — tanpa argumen: lihat tier proyek ini");
  const tf = G.trustFilePath(ISO_HOME);
  const data = G.readTrustFile(ISO_HOME);
  const prev = G.normalizeTrustEntry(data.projects[root]);
  data.projects[root] = { tier, write: prev.write };
  fs.mkdirSync(ISO_HOME, { recursive: true });
  fs.writeFileSync(tf, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  try { fs.chmodSync(tf, 0o600); } catch {}
  console.log(`tier proyek ${root} → ${tier}`);
  showScope();
  process.exit(0);
}
// ---------- engine terpin: hanya diganti lewat perintah eksplisit ----------
if (sub === "engine" || sub === "upgrade-engine") {
  const EN = await import(pathToFileURL(path.join(ROOT, "lib", "engine.mjs")).href);
  const home = env.SW_HOME || env.LUMI_HOME || path.join(os.homedir(), ".lumitome");
  const cur = EN.engineBin(home);
  const ver = () => { try { return execFileSync(cur, ["--version"], { encoding: "utf8", env: isoEnv() }).trim(); } catch { return "(tidak ada)"; } };
  if (sub === "engine") { console.log(`engine: ${cur}\nversi:  ${ver()}\nbuild:  ${EN.installedFlavor(cur) || "upstream"} (LUMI_ENGINE=upstream → OpenCode resmi)\nautoupdate: mati (OPENCODE_DISABLE_AUTOUPDATE=1, update:"disable")`); process.exit(0); }
  const [v, ...rest] = argv.slice(1);
  const shaArg = rest[rest.indexOf("--sha256") + 1];
  if (!v || !/^\d+\.\d+\.\d+$/.test(v) || rest.indexOf("--sha256") < 0 || !/^[0-9a-f]{64}$/.test(shaArg || ""))
    die(2, "pakai: lumitome upgrade-engine <x.y.z> --sha256 <sha256 arsip rilis> [--yes]  (checksum wajib; lihat SHA256SUMS rilis OpenCode)");
  const url = EN.assetFor(v, process.platform, process.arch, "upstream").url;
  if (!rest.includes("--yes")) {
    process.stderr.write(`Ganti engine ${ver()} → v${v}\n  ${url}\n  sha256 ${shaArg}\nKetik 'ya' untuk lanjut: `);
    const ans = await new Promise((r) => { process.stdin.once("data", (d) => r(String(d).trim())); });
    if (ans !== "ya") die(1, "dibatalkan");
  }
  const dst = path.join(home, "engines", v, EN.exeName());
  try { await EN.installEngine({ home, version: v, sha: shaArg, dst }); } catch (e) { die(1, `${e.message}; engine lama dipertahankan`); }
  // simpan engine lama ke engines/<versi>, lalu ganti bin/opencode (Windows: salin; lainnya: symlink)
  if (fs.existsSync(cur) && !fs.lstatSync(cur).isSymbolicLink()) { const old = ver().replace(/^.*?v?(\d+\.\d+\.\d+).*$/s, "$1"); const od = path.join(home, "engines", old); fs.mkdirSync(od, { recursive: true }); fs.renameSync(cur, path.join(od, EN.exeName())); }
  fs.rmSync(cur, { force: true });
  if (process.platform === "win32") fs.copyFileSync(dst, cur); else fs.symlinkSync(dst, cur);
  console.log(`engine → ${ver()} (${cur}); versi lama di ${path.join(home, "engines")}`);
  process.exit(0);
}
// ---------- provider: custom (LUMI_HOME/providers.json + credentials.json 0600) + env NINEROUTER_API_KEY (override) ----------
const PV = await import(pathToFileURL(path.join(ROOT, "lib", "providers.mjs")).href);
// menu provider (layar penuh): `lumitome provider`, dan otomatis saat belum ada provider
async function providerMenu() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) die(2, "menu provider butuh terminal interaktif; pakai: lumitome connect --type openai|anthropic --name <n> --base-url <url> --key-env VAR");
  const UI = await import(pathToFileURL(path.join(ROOT, "lib", "provider-ui.mjs")).href);
  return UI.run({ home: ISO_HOME, PV });
}
if (sub === "provider") { await providerMenu(); process.exit(0); }
// service engine milik LUMI_HOME ini: status / stop (service OpenCode milik user tidak disentuh)
if (sub === "service" && (argv[1] === "stop" || argv[1] === "status")) {
  const SC = await import(pathToFileURL(path.join(ROOT, "lib", "service-ctl.mjs")).href);
  const st = SC.status(ISO_HOME);
  if (argv[1] === "status") { console.log(st.running ? `service Lumitome: jalan (pid ${st.pid}${st.url ? `, ${st.url}` : ""})` : "service Lumitome: tidak jalan"); process.exit(0); }
  console.log(SC.stop(ISO_HOME) ? `service Lumitome dihentikan (pid ${st.pid})` : "service Lumitome: tidak jalan"); process.exit(0);
}
// ---------- codemem index (v0.3.44): status / re-index manual proyek ini ----------
// Tanpa flag: tampilkan status indeks proyek ini. `--refresh`: paksa re-index
// sekarang (melewati "already"/"running" + opt-out LUMI_AUTO_INDEX=0 — perintah
// eksplisit pengguna; aturan skip keamanan tetap berlaku: home/sistem/bukan proyek).
if (sub === "index") {
  const CM = await import(pathToFileURL(path.join(ROOT, "lib", "codemem.mjs")).href);
  const ws = fs.realpathSync(env.LUMI_WORKSPACE || process.cwd());
  if (argv.includes("--refresh")) {
    const st = CM.maybeAutoIndex({ home: ISO_HOME, dir: ws, env: { ...process.env }, runner: path.join(ROOT, "lib", "codemem-index-run.mjs"), force: true });
    console.log(`lumitome: index ${st}`);
    process.exit(st === "no-binary" || st === "failed" ? 1 : 0);
  }
  const cur = CM.readIndexState(ISO_HOME)[ws];
  console.log(cur ? `lumitome: index ${cur.status}${cur.finished ? ` (${new Date(cur.finished).toISOString()})` : ""}` : "lumitome: index belum pernah jalan di proyek ini (otomatis saat pertama dibuka, atau: lumitome index --refresh)");
  process.exit(0);
}
// `lumitome connect` tanpa flag di terminal → layar provider yang sama; teks hanya untuk non-TTY, --text, atau flag lengkap/--list/--remove
if (sub === "connect" && process.stdin.isTTY && process.stdout.isTTY && !argv.includes("--text")
  && !["--list", "--remove", "--type", "--name", "--base-url", "--key-env", "--key-stdin"].some((f) => argv.includes(f))) { await providerMenu(); process.exit(0); }
if (sub === "connect" || (sub === "models" && argv.includes("--refresh")) || (sub === "models" && argv.includes("--lumitome"))) {
  process.exit(await PV.cli({ argv: argv.slice(1), home: ISO_HOME, sub }));
}
// v0.3.38: auto-refresh model saat startup — provider baru yang ditambah di
// dashboard 9router (GET {base}/models berubah) langsung terbaca tanpa
// `lumitome models --refresh` manual. Best-effort, timeout pendek, gagal →
// cache lama dipakai, startup tidak pernah gagal karenanya. Opt-out:
// LUMI_AUTO_REFRESH=0. (connect/models --refresh/provider menu keluar di atas.)
try { await PV.autoRefresh(ISO_HOME); } catch (e) { if (env.LUMI_DEBUG) process.stderr.write(`lumitome: auto-refresh provider gagal (${e.message})\n`); }
const FRAG = PV.opencodeFragment(ISO_HOME, env);
const HAS_9R_ENV = !!FRAG.env.LUMI_KEY_9ROUTER;
const HAS_PROVIDER = HAS_9R_ENV || Object.keys(FRAG.providers).length > 0;
function chooseModel() {
  if (env.LUMI_MODEL) return env.LUMI_MODEL;
  if (HAS_9R_ENV || FRAG.providers["9router"]?.models["ag/gemini-3.8-flash-high"]) return DEFAULT_MODEL;
  const [n, p] = Object.entries(FRAG.providers)[0] || []; return n ? `${n}/${Object.keys(p.models)[0]}` : null;
}
const MODEL = chooseModel();
if (!HAS_PROVIDER) {
  if (sub === "run") die(2, "belum ada provider. Tambah: `lumitome connect` (Custom OpenAI/Anthropic-compatible) atau export NINEROUTER_API_KEY");
  if (sub === "") {
    if (process.stdin.isTTY && process.stdout.isTTY && env.LUMI_ONBOARD !== "0") {
      const n = await providerMenu();
      if (n > 0) process.exit(spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...argv], { stdio: "inherit", env: process.env }).status ?? 1);
    } else process.stderr.write("lumitome: belum ada provider model. Tambah: `lumitome provider` (menu) atau `lumitome connect`; di TUI: /connect\n");
  }
}

// binary OpenCode milik lumitome (terpin, di dir sendiri) — tidak memakai/menimpa `opencode` global user
function ocBin() {
  if (env.LUMI_OPENCODE) return env.LUMI_OPENCODE;
  const exe = process.platform === "win32" ? "opencode.exe" : "opencode";
  for (const d of [env.SW_HOME, env.LUMI_HOME, path.join(os.homedir(), ".lumitome")]) if (d && fs.existsSync(path.join(d, "bin", exe))) return path.join(d, "bin", exe);
  return exe;
}
const HOME = env.LUMI_HOME || path.join(os.homedir(), ".lumitome");
const WS = fs.realpathSync(env.LUMI_WORKSPACE || process.cwd());
const RUN_ID = crypto.randomUUID();
fs.mkdirSync(path.join(HOME, "runs"), { recursive: true });
const JOURNAL = path.join(HOME, "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-${RUN_ID.slice(0, 8)}.jsonl`);

// config dir per-user di LUMI_HOME — dipindah ke atas: buildFinalConfig butuh CFG_DIR.
// config dir per-user di LUMI_HOME (symlink ke config harness): OpenCode menulis state (mis. service.json berisi
// password server) ke OPENCODE_CONFIG_DIR — jangan sampai masuk ke direktori repo.
const CFG_DIR = path.join(HOME, "config");
fs.mkdirSync(CFG_DIR, { recursive: true, mode: 0o700 });
// sumber asli (bukan symlink repo lumitome/config/* — symlink hilang di paket npm & checkout Windows)
const CFG_SRC = { "opencode.jsonc": path.join(ROOT, "config", "opencode.jsonc"), plugins: path.join(ROOT, "config", "plugins"), themes: path.join(ROOT, "config", "themes"),
  skills: path.join(REPO, ".opencode", "skills"), rules: path.join(ROOT, "rules"), agents: path.join(REPO, ".opencode", "agents"), commands: path.join(REPO, ".opencode", "commands") };
for (const [n, src] of Object.entries(CFG_SRC)) {
  if (!fs.existsSync(src)) continue;
  const dst = path.join(CFG_DIR, n);
  let cur = null; try { cur = fs.readlinkSync(dst); } catch {}
  if (cur !== src) linkInto(src, dst);
}
{ const CMG = await import(pathToFileURL(path.join(ROOT, "lib", "config-migrate.mjs")).href); try { CMG.migrateConfigFile(path.join(CFG_DIR, "opencode.jsonc")); } catch {} }
// Windows: symlink butuh hak admin/Developer Mode → direktori pakai junction, file disalin
function linkInto(src, dst) {
  try { fs.rmSync(dst, { force: true, recursive: !fs.lstatSync(dst).isSymbolicLink() && fs.lstatSync(dst).isDirectory() }); } catch {}
  const dir = fs.statSync(src).isDirectory();
  if (process.platform !== "win32") return fs.symlinkSync(src, dst);
  try { fs.symlinkSync(src, dst, dir ? "junction" : "file"); } catch { fs.cpSync(src, dst, { recursive: true }); }
}

// auto-index folder proyek di latar (detached, prioritas rendah); LUMI_AUTO_INDEX=0 untuk mematikan
// Di luar buildFinalConfig: ini manajemen proses, bukan rakitan config.
const CMX = await import(pathToFileURL(path.join(ROOT, "lib", "codemem.mjs")).href);
if (sub === "" || sub === "run") {
  try { const st = CMX.maybeAutoIndex({ home: ISO_HOME, dir: WS, env: { ...process.env }, runner: path.join(ROOT, "lib", "codemem-index-run.mjs") });
    if (env.LUMI_DEBUG || st === "started") { if (sub === "" || env.LUMI_DEBUG) process.stderr.write(`lumitome: auto-index ${st}\n`); } } catch (e) { if (env.LUMI_DEBUG) process.stderr.write(`lumitome: auto-index gagal (${e.message})\n`); }
}

// ---------- rakitan config final (seam: lumitome/lib/build-config.mjs) ----------
// Kepercayaan proyek: default config/plugin/agent proyek TIDAK dimuat (repo asing bisa membawa plugin jahat).
const TRUST = env.LUMI_TRUST_PROJECT === "1";
// P1-2 (1): LUMI_TRUST_PROJECT=1 dikonfirmasi interaktif TIAP SESI (bukan sekali di
// stderr) + dicatat di jurnal dengan alasan. Persetujuan TIDAK PERNAH permanen:
// tidak ada file persetujuan; sesi baru = konfirmasi baru. Non-TTY (run/pipe/CI):
// konfirmasi tidak mungkin — dicatat jujur sebagai mode non-tty (bukan pura-pura
// dikonfirmasi); env yang diset eksplisit tetap jalan supaya otomasi headless tidak patah.
const jotTrust = (row) => { try { fs.appendFileSync(JOURNAL, JSON.stringify({ t: Date.now(), ...row }) + "\n"); } catch {} };
if (TRUST) {
  const TP = await import(pathToFileURL(path.join(ROOT, "lib", "trust-project.mjs")).href);
  const interactive = !!(process.stdin.isTTY && process.stderr.isTTY);
  let answer = "";
  if (interactive) {
    process.stderr.write("lumitome: LUMI_TRUST_PROJECT=1: config, plugin, agent & MCP proyek di workspace ini akan DIMUAT dan dapat menjalankan kode. Hanya untuk repo tepercaya.\nKetik 'ya' untuk lanjut (berlaku sesi ini saja): ");
    const rl = await_rl();
    answer = await new Promise((r) => { rl.once("line", (l) => r(String(l).trim())); rl.once("close", () => r("")); });
    rl.close();
  }
  const d = TP.decideTrustProject({ trust: true, interactive, answer });
  jotTrust(TP.trustProjectJournalRow({ runId: RUN_ID, workspace: WS, mode: d.mode, reason: d.reason }));
  if (!d.allowed) die(1, "LUMI_TRUST_PROJECT=1 dibatalkan: tanpa konfirmasi, config proyek tidak dimuat. Jalankan tanpa LUMI_TRUST_PROJECT=1, atau ketik 'ya' di terminal.");
  if (d.mode === "non-tty") process.stderr.write(`lumitome: PERINGATAN KERAS — LUMI_TRUST_PROJECT=1 tanpa konfirmasi interaktif (non-TTY, bukan terminal); config proyek DIMUAT atas risiko env ini. Dicatat di jurnal (${JOURNAL}), berlaku sesi ini saja.\n`);
}
// header 300 s, jeda antar-chunk 900 s, total 1 jam (LUMI_*_TIMEOUT_MS) — dipakai juga retry di bawah
const TIMEOUTS = PV.providerTimeouts(env);
const VALUE_FLAGS = new Set(["-m", "--model", "-s", "--session", "--agent", "--format", "-f", "--file", "--title", "--log-level", "--server"]);
function promptOf(rest) { const out = []; for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (VALUE_FLAGS.has(a)) { i++; continue; } if (a.startsWith("-")) continue; out.push(a); } return out.join(" "); }
const { skillNote } = await (await import(pathToFileURL(path.join(ROOT, "lib", "build-config.mjs")).href)).buildFinalConfig({ env, REPO, ROOT, HOME, WS, CFG_DIR, JOURNAL, RUN_ID, FRAG, MODEL, HAS_9R_ENV, TIMEOUTS, TRUST, sub, prompt: sub === "run" ? promptOf(argv.slice(1)) : "" });

// TUI/attach memakai "managed service" OpenCode (port default 49374 — sama dengan `opencode serve --service` milik
// user). Lumitome memakai port & state sendiri di LUMI_HOME; service milik user tidak disentuh/dimatikan.
if (sub !== "run") {
  const SP = await import(pathToFileURL(path.join(ROOT, "lib", "service-port.mjs")).href);
  const sp = await SP.ensureServicePort({ home: HOME, cfgDir: CFG_DIR, stateHome: path.join(HOME, "state"), env });
  if (env.LUMI_DEBUG) process.stderr.write(`lumitome: service port ${sp.port} (${sp.reason}) — ${sp.file}\n`);
}
try { fs.chmodSync(path.join(CFG_DIR, "service.json"), 0o600); } catch {}
if (TRUST) process.stderr.write("lumitome: PERINGATAN — LUMI_TRUST_PROJECT=1: config, plugin, agent & MCP proyek di workspace ini DIMUAT dan dapat menjalankan kode. Pakai hanya untuk repo tepercaya.\n");
// P1-2 (2): tier dari env (bukan file trust) — peringatan persisten + jurnal.
// Dicetak untuk TUI/run; plugin juga mencatatnya saat engine jalan, tapi baris
// wrapper ini yang ada walau engine gagal start. LUMI_SANDBOX=off yang menurunkan
// tier strict (kehilangan bwrap) ikut diperingatkan + dicatat.
if (sub === "" || sub === "run") {
  try {
    const G = await import(pathToFileURL(path.join(REPO, "harness", "lumi-guard.mjs")).href);
    const td = G.resolveTrustTierDetailed(WS, { home: os.homedir(), lumiHome: ISO_HOME, env });
    if (td.source === "env") {
      process.stderr.write(`lumitome: PERINGATAN — tier sandbox '${td.tier}' berasal dari env LUMI_TRUST_TIER, bukan file trust (~/.lumitome/trust.json). Periksa dengan: lumitome trust\n`);
      jotTrust({ kind: "tier-env", runId: RUN_ID, tier: td.tier, source: "env", workspace: WS, reason: "tier dari env LUMI_TRUST_TIER, bukan file trust (~/.lumitome/trust.json)" });
    }
    if ((env.LUMI_SANDBOX || "") === "off" && td.tier === "strict") {
      process.stderr.write("lumitome: PERINGATAN — LUMI_SANDBOX=off menurunkan tier strict (kehilangan bwrap).\n");
      jotTrust({ kind: "sandbox-downgraded", runId: RUN_ID, tier: td.tier, sandbox: "off", workspace: WS, reason: "LUMI_SANDBOX=off menurunkan tier strict (kehilangan bwrap)" });
    }
  } catch {}
}
// service dipakai ulang hanya bila config/key/versi sama; beda → service lama milik LUMI_HOME dihentikan dulu
if (sub === "" || sub === "service") {
  const SCX = await import(pathToFileURL(path.join(ROOT, "lib", "service-ctl.mjs")).href);
  const fp = SCX.fingerprint([VERSION, env.OPENCODE_CONFIG_CONTENT, FRAG.env, env.LUMI_SANDBOX || "", env.LUMI_9ROUTER_URL || "", TRUST, JSON.stringify(Object.fromEntries(Object.entries(FRAG.providers).map(([n, p]) => [n, [...Object.keys(p.models)].sort()]))) ]);
  try { const r = SCX.ensureFresh(HOME, fp); if (env.LUMI_DEBUG) process.stderr.write(`lumitome: service ${r}\n`); } catch (e) { if (env.LUMI_DEBUG) process.stderr.write(`lumitome: cek service gagal (${e.message})\n`); }
}

// v0.3.19: tier sandbox efektif saat sesi dimulai (plugin yang menegakkan per sesi).
// v0.3.25: diam secara default — baris ini rame di depan TUI (v0.3.10 sudah menghapus banner wrapper);
// tier tetap bisa dilihat lewat `lumitome trust` + jurnal. LUMI_VERBOSE=1 untuk menampilkan.
if ((sub === "" || sub === "run") && process.stderr.isTTY && env.LUMI_VERBOSE === "1") {
  try {
    const G = await import(pathToFileURL(path.join(REPO, "harness", "lumi-guard.mjs")).href);
    const s = G.buildSandboxScope(WS, { home: os.homedir(), lumiHome: ISO_HOME, env });
    process.stderr.write(`lumitome: sandbox ${s.tier} · tulis: ${s.write.join(", ")} · ${s.tier === "strict" ? "bwrap" : "guard saja"}\n`);
  } catch {}
}

// ---------- branding (tanpa patch engine) ----------
// theme bawaan OpenCode (hanya logo emas, dari engine Lumitome) + terminal.title:false di cli.json TERISOLASI (LUMI_HOME/config) — kunci milik user dihormati
{
  const BR = await import(pathToFileURL(path.join(ROOT, "lib", "brand.mjs")).href);
  // engine v2.2.4: OPENCODE_CONFIG_DIR juga menjadi lokasi cli.json (terverifikasi; XDG_CONFIG_HOME/opencode/cli.json diabaikan saat CONFIG_DIR di-set)
  const cliFile = path.join(CFG_DIR, "cli.json");
  try {
    let cur = {}; try { cur = JSON.parse(fs.readFileSync(cliFile, "utf8")); } catch {}
    const mark = path.join(CFG_DIR, ".theme-default-v038");
    const r = BR.seedCliConfig(cur, { migrated: fs.existsSync(mark) });
    if (r.changed && env.LUMI_NO_BRAND !== "1") { fs.mkdirSync(path.dirname(cliFile), { recursive: true }); fs.writeFileSync(cliFile, JSON.stringify(r.config, null, 2) + "\n", { mode: 0o600 }); }
    if (env.LUMI_NO_BRAND !== "1" && !fs.existsSync(mark)) { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(mark, ""); }
  } catch (e) { if (env.LUMI_DEBUG) process.stderr.write(`lumitome: cli.json branding dilewati (${e.message})\n`); }
  // v0.3.10: tanpa banner wrapper sebelum TUI — wordmark LUMITOME engine sudah cukup; hanya judul jendela
  if (sub === "" && process.stderr.isTTY && env.LUMI_NO_BRAND !== "1") process.stderr.write(BR.titleSeq());
}
env.LUMI_WRAPPER_PID = String(process.pid);
// serve/web: password dibuat wrapper, disimpan 0600, TIDAK dicetak ke stdout
let SERVE_PW = null;
if (sub === "serve" || sub === "web") {
  SERVE_PW = env.OPENCODE_SERVER_PASSWORD || crypto.randomBytes(24).toString("base64url");
  env.OPENCODE_SERVER_PASSWORD = SERVE_PW;
  const pf = env.LUMI_SERVE_PASSWORD_FILE || path.join(HOME, "serve.password");
  fs.writeFileSync(pf, SERVE_PW + "\n", { mode: 0o600 }); fs.chmodSync(pf, 0o600);
  process.stderr.write(`lumitome: server password disimpan di ${pf} (mode 0600; user: opencode)\n`);
}
const redact = (t) => { let o = t.replace(/(server password\s*[:=]?\s*)\S+/gi, "$1[REDACTED]"); if (SERVE_PW) o = o.split(SERVE_PW).join("[REDACTED]"); return o; };
// reaper: proses milik wrapper lumitome lain yang sudah mati (mis. kena kill -9) dibersihkan saat start
const HAS_PROC = fs.existsSync("/proc/self/environ");
function reapOrphans() {
  let n = 0, keep = null; if (!HAS_PROC) return 0;
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    let e; try { e = fs.readFileSync(`/proc/${d}/environ`, "latin1"); } catch { continue; }
    const m = e.match(/(?:^|\0)LUMI_WRAPPER_PID=(\d+)/); if (!m || m[1] === String(process.pid)) continue;
    if (fs.existsSync(`/proc/${m[1]}`)) continue;
    if ((keep ??= keepPids()).has(Number(d))) continue;
    try { process.kill(Number(d), "SIGKILL"); n++; } catch {}
  }
  return n;
}
// service engine milik LUMI_HOME (beserta MCP-nya) dipakai ulang lintas jalan: jangan ikut dibersihkan
const SC = await import(pathToFileURL(path.join(ROOT, "lib", "service-ctl.mjs")).href);
const keepPids = () => { try { return SC.protectedPids(HOME); } catch { return new Set(); } };
const reaped = reapOrphans();
if (reaped && env.LUMI_DEBUG) process.stderr.write(`lumitome: reaper membersihkan ${reaped} proses yatim\n`);
// ---------- argumen ----------
let args = argv.slice();
if (sub === "run") {
  const rest = args.slice(1);
  const mIdx = rest.flatMap((a, i) => (a === "-m" || a === "--model" || a.startsWith("--model=") ? [i] : []));
  if (mIdx.length > 1) die(2, "flag -m/--model diberikan lebih dari sekali — pilih satu");
  if (mIdx.length === 1 && rest[mIdx[0]].startsWith("--model=") === false && !rest[mIdx[0] + 1]) die(2, "-m butuh nilai provider/model");
  if (!promptOf(rest) && !rest.some((a) => ["-c", "--continue", "-s", "--session", "-f", "--file"].includes(a))) die(2, "run butuh pesan (atau --session/--continue/--file)");
  const model = env.LUMI_MODEL && mIdx.length === 0 ? env.LUMI_MODEL : null;
  args = ["run", "--standalone", ...(mIdx.length ? [] : ["-m", model || MODEL]), ...rest];
  env.LUMI_HEADLESS = "1";
} else if (["session", "debug", "mcp", "models", "stats"].includes(sub) && !args.includes("--standalone") && !args.includes("--server")) {
  args = [...args, "--standalone"];
}

// ---------- jalankan + cleanup ----------
function descendantsByRunId() {
  const out = []; if (!HAS_PROC) return out;
  const keep = sub === "run" ? new Set() : keepPids();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid || keep.has(Number(d))) continue;
    try { if (fs.readFileSync(`/proc/${d}/environ`, "latin1").includes(`LUMI_RUN_ID=${RUN_ID}`)) out.push(Number(d)); } catch {}
  }
  return out;
}
function cleanup() {
  let pids = descendantsByRunId();
  for (const p of pids) try { process.kill(p, "SIGTERM"); } catch {}
  const t0 = Date.now(); while (Date.now() - t0 < 1500 && (pids = descendantsByRunId()).length) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  for (const p of pids) try { process.kill(p, "SIGKILL"); } catch {}
  return pids.length;
}
const PIPED = new Set(["run", "serve", "web"]);
const HAS_SETPRIV = process.platform === "linux" && (() => { try { execFileSync("setpriv", ["--pdeathsig", "SIGTERM", "--", "true"], { stdio: "ignore" }); return true; } catch { return false; } })();
// v0.3.25: filter baris status service engine di stderr TUI (lib/quiet-stderr.mjs)
const { QUIET_ENGINE_LINES, filterStderr } = await import(pathToFileURL(path.join(ROOT, "lib", "quiet-stderr.mjs")).href);
function runOnce(a) {
  return new Promise((resolve) => {
    // setpriv --pdeathsig: opencode ikut mati bila wrapper kena SIGKILL (sisa MCP lalu dibersihkan reaper)
    const pd = HAS_SETPRIV ? ["setpriv", ["--pdeathsig", "SIGTERM", "--", ocBin(), ...a]] : [ocBin(), a];
    // TUI & subperintah interaktif: stdio diwariskan (TTY asli); run/serve: pipe (deteksi timeout / redaksi password)
    const piped = PIPED.has(sub);
    // v0.3.25: TUI & bukan verbose — stderr engine dipipe agar baris status service ("Starting background
    // server...") bisa disaring; stdin/stdout tetap TTY asli, jadi TUI tidak terganggu.
    const filterErr = sub === "" && env.LUMI_VERBOSE !== "1";
    const child = spawn(pd[0], pd[1], { cwd: WS, env, stdio: piped ? ["inherit", "pipe", "pipe"] : filterErr ? ["inherit", "inherit", "pipe"] : "inherit" });
    let tail = "", out = "";
    const keep = (b) => { tail = (tail + b.toString()).slice(-8000); };
    if (piped) {
      child.stdout.on("data", (b) => { const t = redact(b.toString()); process.stdout.write(t); keep(t); out = (out + t).slice(-4000); });
      child.stderr.on("data", (b) => { const t = redact(b.toString()); process.stderr.write(t); keep(t); });
    }
    let errBuf = "";
    if (filterErr) {
      child.stderr.on("data", (b) => {
        const r = filterStderr(redact(b.toString()), errBuf);
        errBuf = r.rest;
        if (r.out) process.stderr.write(r.out);
      });
    }
    const left = DEADLINE - Date.now();
    // stop(): SIGTERM → 5 s → SIGKILL child + semua proses ber-LUMI_RUN_ID (opencode bisa menggantung saat tool berjalan)
    const stop = (s = "SIGTERM") => { try { child.kill(s); } catch {} setTimeout(() => { try { child.kill("SIGKILL"); } catch {} for (const p of descendantsByRunId()) try { process.kill(p, "SIGKILL"); } catch {} }, 5000).unref(); };
    const timer = sub === "run" && left > 0 ? setTimeout(() => { deadlineHit = true; stop(); }, left) : null;
    const fwd = (s) => () => { if (sub === "run") stop(s); else try { child.kill(s); } catch {} };
    const handlers = { SIGINT: fwd("SIGINT"), SIGTERM: fwd("SIGTERM"), SIGHUP: fwd("SIGHUP") };
    for (const [s, h] of Object.entries(handlers)) process.on(s, h);
    // watchdog respons pertama: tanpa output & tanpa aktivitas tool dalam LUMI_FIRST_OUTPUT_MS → provider dianggap diam
    const t0 = Date.now(), firstMs = Number(env.LUMI_FIRST_OUTPUT_MS || 90000);
    const acted = () => readJournal().some((r) => r.kind !== "guard");
    const wd = sub === "run" && firstMs > 0 ? setInterval(() => {
      // header "> agent · model", event JSON step_start/error & baris kosong/ANSI bukan respons
      const real = out.replace(/\x1b?\[[0-9;]*m/g, "").split("\n").filter((l) => l.trim() && !/^\s*>\s.*·/.test(l) && !/^\{"type":"(step_start|error)"/.test(l.trim()));
      if (real.length || acted()) { clearInterval(wd); return; }
      if (Date.now() - t0 > firstMs) { clearInterval(wd); stallHit = true; stop(); }
    }, 1000) : null;
    child.on("exit", (code, sig) => {
      if (filterErr && errBuf && !QUIET_ENGINE_LINES.has(errBuf)) process.stderr.write(errBuf);
      if (timer) clearTimeout(timer); if (wd) clearInterval(wd); for (const [s, h] of Object.entries(handlers)) process.off(s, h); resolve({ code: code ?? (sig ? 128 + 1 : 1), tail });
    });
  });
}
const readJournal = () => { try { return fs.readFileSync(JOURNAL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const TIMEOUT_RE = /timeout|timed out|ETIMEDOUT|headerTimeout|chunkTimeout|TimeoutError|aborted due to timeout/i;

const DEADLINE = Date.now() + Number(env.LUMI_DEADLINE_MS || 300000); // batas keras run (default 5 menit)
let deadlineHit = false, stallHit = false;
// preflight provider (v0.3.44: modul lib/preflight.mjs — server MATI gagal-cepat
// tanpa retry + diagnosis terpandu; server LAMBAT tetap di-retry, timeout tidak
// diperpendek). GET {baseURL} — status HTTP apa pun (mis. 401) = server hidup.
if (sub === "run" && env.LUMI_PREFLIGHT !== "0") {
  const PF = await import(pathToFileURL(path.join(ROOT, "lib", "preflight.mjs")).href);
  const mi = args.indexOf("-m"), prov = mi >= 0 ? String(args[mi + 1]).split("/")[0] : "9router";
  const base = FRAG.providers[prov]?.settings.baseURL || env.LUMI_9ROUTER_URL;
  const r = await PF.preflight({ base, timeoutMs: Number(env.LUMI_PREFLIGHT_TIMEOUT_MS || 8000), retries: Number(env.LUMI_PREFLIGHT_RETRIES ?? 2),
    userAgent: `lumitome/${VERSION}`, log: (m) => process.stderr.write(m + "\n") });
  if (!r.ok) {
    const cur = PV.load(ISO_HOME)[prov];
    process.stderr.write(`lumitome: GAGAL — provider ${MODEL || env.LUMI_9ROUTER_URL} tidak merespons (preflight); tidak menjalankan opencode\n`);
    process.stderr.write(PF.preflightDiagnosis({ provider: prov, base, kind: r.kind, lastModels: cur ? { updated: cur.updated, count: cur.models?.length } : null }) + "\n");
    process.exit(124);
  }
}
let res; const retries = Number(env.LUMI_RETRIES ?? 2);
for (let attempt = 0; ; attempt++) {
  res = await runOnce(args);
  const j = readJournal();
  const worked = j.some((r) => r.kind === "shell" || r.kind === "tool" || r.kind === "shell-start");
  if (deadlineHit || stallHit) break;
  if (sub === "run" && res.code !== 0 && TIMEOUT_RE.test(res.tail) && !worked && attempt < retries) {
    const wait = 2000 * 2 ** attempt;
    process.stderr.write(`lumitome: provider timeout (idle ${TIMEOUTS.chunkTimeout} ms) — retry ${attempt + 1}/${retries} dalam ${wait} ms\n`);
    await new Promise((r) => setTimeout(r, wait)); continue;
  }
  break;
}
const killed = cleanup();
if (killed && env.LUMI_DEBUG) process.stderr.write(`lumitome: cleanup ${killed} proses tertinggal\n`);
let code = res.code;
if (sub === "run") {
  const j = readJournal();
  const guard = j.find((r) => r.kind === "guard");
  if (deadlineHit) { process.stderr.write(`lumitome: GAGAL — melewati LUMI_DEADLINE_MS; proses dihentikan\n`); code = 124; }
  else if (stallHit) { process.stderr.write(`lumitome: GAGAL — provider diam: tak ada respons dalam LUMI_FIRST_OUTPUT_MS; proses dihentikan\n`); code = 124; }
  else if (code !== 0 && TIMEOUT_RE.test(res.tail)) { process.stderr.write(`lumitome: GAGAL — provider timeout (header ${TIMEOUTS.headerTimeout} / idle ${TIMEOUTS.chunkTimeout} ms, ${retries} retry habis)\n`); code = 124; }
  else if (code === 0 && guard?.status === "closed") { process.stderr.write(`lumitome: ${guard.reason}\n`); code = 5; }
  else if (code === 0 && !guard) { process.stderr.write("lumitome: LUMI_GUARD_MISSING — plugin guard tidak termuat; hasil tidak tepercaya\n"); code = 5; }
  else if (code === 0 && env.LUMI_DONE_GATE !== "off") {
    const { doneGateFromJournal } = await import(pathToFileURL(path.join(REPO, "harness", "lumi-guard.mjs")).href);
    const dg = doneGateFromJournal(j);
    if (dg.spin) { process.stderr.write(`lumitome: ANTI-SPIN TRIP — ${dg.spin.reason}\n`); code = 4; }
    else if (dg.ran && dg.last.exit !== 0) {
      const { evaluateDoneGate } = await import(pathToFileURL(path.join(REPO, "harness", "done-gate.ts")).href).catch(() => ({}));
      const r = evaluateDoneGate ? evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], testCommandExitCode: dg.last.exit, facts: dg.facts }) : { isDone: false, failureReason: "tes gagal" };
      process.stderr.write(`lumitome: DONE-GATE FAIL — ${r.failureReason}${dg.last.why ? ` (${dg.last.why})` : ""}; FACT: \`${dg.last.command}\` exit=${dg.last.raw_exit ?? dg.last.exit}\n`); code = 3;
    } else if (dg.ran) process.stderr.write(`lumitome: DONE-GATE PASS — FACT: \`${dg.last.command}\` exit=0\n`);
    else if (dg.wrote) {
      // P0-3: kode diubah tapi tidak ada perintah tes di jurnal — gagal (exit 3), bukan lolos diam-diam.
      // sector/scanGate TIDAK diteruskan: doneGateFromJournal tidak menyediakannya (hanya ran/last/spin/facts/wrote);
      // evaluateDoneGate tanpa bukti tes sudah fail-closed, jadi pemanggilan tanpa bukti ini gagal sendiri.
      const { evaluateDoneGate } = await import(pathToFileURL(path.join(REPO, "harness", "done-gate.ts")).href).catch(() => ({}));
      const r = evaluateDoneGate ? evaluateDoneGate({ commandExitCode: 0, expectedArtifacts: [], facts: dg.facts }) : { isDone: false, failureReason: "tidak ada bukti tes" };
      process.stderr.write(`lumitome: DONE-GATE FAIL — ${r.failureReason}; file diubah tapi tidak ada perintah tes di jurnal\n`); code = 3;
    } else process.stderr.write(`lumitome: DONE-GATE SKIP — tidak ada perintah tes di jurnal dan tidak ada file diubah (tugas tanpa kode); gate tidak relevan\n`);
  }
  if (env.LUMI_DEBUG) process.stderr.write(`lumitome: jurnal ${JOURNAL} ${skillNote}\n`);
}
process.exit(code);
