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
const VERSION = "0.3.13";
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
  // instalasi npm (tanpa .git): update lewat npm, bukan git
  if (!fs.existsSync(path.join(REPO, ".git")) && (env.LUMI_INSTALL === "npm" || REPO.split(path.sep).includes("node_modules"))) {
    console.log(`lumitome ${VERSION} terpasang lewat npm. Perbarui dengan:\n  npm i -g https://github.com/fahmi0812/Lumitome/tarball/main\n(setelah terbit di npm: npm i -g ${env.LUMI_NPM_NAME || "lumitome"}@latest)\nEngine OpenCode tidak ikut berubah.`);
    process.exit(0);
  }
  const { update } = await import(pathToFileURL(path.join(ROOT, "lib", "update.mjs")).href);
  process.exit(await update({ argv: argv.slice(1), version: VERSION, repo: REPO, home: ISO_HOME }));
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
// `lumitome connect` tanpa flag di terminal → layar provider yang sama; teks hanya untuk non-TTY, --text, atau flag lengkap/--list/--remove
if (sub === "connect" && process.stdin.isTTY && process.stdout.isTTY && !argv.includes("--text")
  && !["--list", "--remove", "--type", "--name", "--base-url", "--key-env", "--key-stdin"].some((f) => argv.includes(f))) { await providerMenu(); process.exit(0); }
if (sub === "connect" || (sub === "models" && argv.includes("--refresh")) || (sub === "models" && argv.includes("--lumitome"))) {
  process.exit(await PV.cli({ argv: argv.slice(1), home: ISO_HOME, sub }));
}
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

// ---------- override final ----------
function stripJsonc(s) { return s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? ""); }
// Kepercayaan proyek: default config/plugin/agent proyek TIDAK dimuat (repo asing bisa membawa plugin jahat).
const TRUST = env.LUMI_TRUST_PROJECT === "1";
function projectMcp() {
  if (!TRUST) return {};
  for (const f of ["opencode.jsonc", "opencode.json", ".opencode/opencode.jsonc", ".opencode/opencode.json"]) {
    const p = path.join(WS, f); if (!fs.existsSync(p)) continue;
    try { const c = JSON.parse(stripJsonc(fs.readFileSync(p, "utf8")).replace(/,(\s*[}\]])/g, "$1")); return c.mcp?.servers || {}; } catch { return {}; }
  }
  return {};
}
// default: codemem + 4 sektor inti; finance/media hanya via LUMI_MCP=all atau daftar eksplisit
// v0.3.13: satu proses `skills` untuk semua sektor (dulu 4 proses skills-<sektor>); codemem hanya aktif di repo git (shim)
const DEFAULT_MCP = "codemem,skills";
const wantMcp = (env.LUMI_MCP ?? DEFAULT_MCP).split(",").map((s) => s.trim()).filter(Boolean);
const mcpOverride = {};
for (const [name, def] of Object.entries(projectMcp())) {
  const on = wantMcp.includes("all") || wantMcp.includes(name);
  if (!on) mcpOverride[name] = { ...def, disabled: true };
}
// MCP skill_search milik Lumitome (path absolut instalasi) → tersedia di proyek mana pun tanpa config proyek
// tool per sektor: skills_<sektor>_skill_search (agent sektor hanya diizinkan tool sektornya). Nama lama skills-<sektor> di LUMI_MCP tetap diterima.
const ALL_SECTORS = ["coding", "security", "riset", "penulisan", "finance", "media"];
const skillSectors = wantMcp.includes("all") || wantMcp.includes("skills") ? ALL_SECTORS : ALL_SECTORS.filter((sec) => wantMcp.includes(`skills-${sec}`));
if (skillSectors.length) mcpOverride.skills = { type: "local", command: [process.execPath, "--no-warnings", path.join(REPO, "router", "skill-search-mcp.mjs"), "--sectors", skillSectors.join(","), "--root", REPO], timeout: { startup: 30000, catalog: 30000, execution: 30000 } };
// drawio (next-ai-draw-io, terpin) — opsional, mati default; hanya bila disebut eksplisit di LUMI_MCP (tidak ikut "all")
if (wantMcp.includes("drawio")) mcpOverride.drawio = { type: "local", command: ["npx", "-y", "@next-ai-drawio/mcp-server@0.4.11"], environment: { BROWSER: env.BROWSER || "" }, timeout: { startup: 120000, catalog: 120000, execution: 120000 } };
// codemem global: binary absolut di LUMI_HOME/bin (bukan PATH, bukan config proyek). Tidak pernah `install`.
const CM = await import(pathToFileURL(path.join(ROOT, "lib", "codemem.mjs")).href);
if (wantMcp.includes("all") || wantMcp.includes("codemem")) {
  const def = CM.codememServer(ISO_HOME);
  if (def) mcpOverride.codemem = def;
  else if (sub === "" || sub === "run" || env.LUMI_DEBUG) process.stderr.write(`lumitome: codemem dilewati — ${CM.cbmBin(ISO_HOME)} belum ada\n`);
}
// auto-index folder proyek di latar (detached, prioritas rendah); LUMI_AUTO_INDEX=0 untuk mematikan
if (sub === "" || sub === "run") {
  try { const st = CM.maybeAutoIndex({ home: ISO_HOME, dir: WS, env: { ...process.env }, runner: path.join(ROOT, "lib", "codemem-index-run.mjs") });
    if (env.LUMI_DEBUG || st === "started") { if (sub === "" || env.LUMI_DEBUG) process.stderr.write(`lumitome: auto-index ${st}\n`); } } catch (e) { if (env.LUMI_DEBUG) process.stderr.write(`lumitome: auto-index gagal (${e.message})\n`); }
}
// agent default: orchestrator di TUI; `run` headless tetap build (delegasi orchestrator headless belum terverifikasi live). LUMI_AGENT menimpa
const RUN_AGENT = "build";
const DENY = (r) => ({ action: "shell", resource: r, effect: "deny" });
// header 300 s, jeda antar-chunk 900 s, total 1 jam (LUMI_*_TIMEOUT_MS)
const TIMEOUTS = PV.providerTimeouts(env);
const finalCfg = {
  update: "disable",
  ...(env.LUMI_AGENT ? { default_agent: env.LUMI_AGENT } : { default_agent: sub === "run" ? RUN_AGENT : "orchestrator" }),
  providers: { "9router": { settings: { ...TIMEOUTS } } },
  ...(Object.keys(mcpOverride).length ? { mcp: { servers: mcpOverride } } : {}),
  // lapis-2 (lapis-1 = plugin guard): deny di akhir rantai → last-match-wins
  permissions: [
    // pola diawali "*" karena string yang dicek OpenCode = `bwrap --args 3 bash -c '<perintah>' …`
    { action: "shell", resource: "*git push *", effect: "ask" },
    // .env: isi ditolak lapis-1 (guard) + di-mask /dev/null oleh bwrap; daftar nama (ls/find/glob) diizinkan
    ...["*id_rsa*", "*id_ed25519*", "*.ssh/*", "*rm -rf /*", "*rm -rf ~*", "*rm -fr /*", "*rm -rf ..*", "*sudo *",
      "*git push *-f*", "*git push *--force*", "*git push *main*", "*git push *master*", "*git push *+*", "*printenv*", "*NINEROUTER_API_KEY*", "*LUMI_KEY_*"].map(DENY),
    { action: "read", resource: "*.env", effect: "deny" }, { action: "read", resource: "*.env.*", effect: "deny" },
    { action: "read", resource: "*.env.example", effect: "allow" }, { action: "read", resource: "*secrets.env", effect: "deny" },
    { action: "read", resource: "*id_rsa*", effect: "deny" }, { action: "read", resource: "*/.ssh/*", effect: "deny" },
    { action: "external_directory", resource: "*", effect: "ask" },
  ],
};
// provider custom → config final (key hanya via env {env:LUMI_KEY_*}); timeout berlaku untuk semua provider
for (const [n, p] of Object.entries(FRAG.providers)) finalCfg.providers[n] = { ...p, settings: { ...p.settings, ...TIMEOUTS } };
if (MODEL) finalCfg.model = MODEL;
if (!HAS_9R_ENV && !FRAG.providers["9router"]) finalCfg.disabled_providers = ["9router"];

// ---------- skill scoping (kurangi prompt sistem): hanya ≤5 skill hasil router yang terlihat ----------
const VALUE_FLAGS = new Set(["-m", "--model", "-s", "--session", "--agent", "--format", "-f", "--file", "--title", "--log-level", "--server"]);
function promptOf(rest) { const out = []; for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (VALUE_FLAGS.has(a)) { i++; continue; } if (a.startsWith("-")) continue; out.push(a); } return out.join(" "); }
let skillNote = "";
// router & DB skill milik harness (REPO), bukan workspace → konsisten di repo mana pun & tidak bisa disuntik proyek
if (sub === "run" && (env.LUMI_SKILLS ?? "auto") === "auto" && fs.existsSync(path.join(REPO, "runtime", "skills.db")) && fs.existsSync(path.join(REPO, "router", "skill-db.mjs"))) {
  const prompt = promptOf(argv.slice(1));
  if (prompt) {
    try {
      const SD = await import(pathToFileURL(path.join(REPO, "router", "skill-db.mjs")).href);
      const saved = process.cwd(); process.chdir(REPO);
      // L1 = cadangan: "auto" (default) hanya saat confidence L0 rendah, timeout keras 3 s; "always"/"1"; "0" = mati
      const l1m = String(env.LUMI_ROUTER_L1 ?? "auto"), useL1 = l1m === "0" ? false : (l1m === "always" || l1m === "1") ? "always" : true;
      const r9 = FRAG.providers["9router"];
      if (useL1) process.env.SW_9ROUTER_URL ||= env.LUMI_9ROUTER_URL || r9?.settings.baseURL || "http://127.0.0.1:20128/v1";
      if (useL1 && !process.env.NINEROUTER_API_KEY && r9) process.env.SW_9ROUTER_KEY ||= FRAG.env.LUMI_KEY_9ROUTER;
      process.env.SW_ROUTE_CACHE ||= path.join(HOME, "router-cache.json");
      const r = await SD.route(prompt, { root: REPO, useL1, log: false });
      process.chdir(saved);
      finalCfg.permissions.push({ action: "skill", resource: "*", effect: "deny" }, ...r.picked.map((n) => ({ action: "skill", resource: n, effect: "allow" })));
      skillNote = `skills=${r.picked.join(",") || "-"} (L1=${r.l1.status})`;
    } catch (e) { skillNote = `skill-router gagal (${e.message}); semua skill tetap terlihat`; }
  }
}
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
// TUI/attach memakai "managed service" OpenCode (port default 49374 — sama dengan `opencode serve --service` milik
// user). Lumitome memakai port & state sendiri di LUMI_HOME; service milik user tidak disentuh/dimatikan.
if (sub !== "run") {
  const SP = await import(pathToFileURL(path.join(ROOT, "lib", "service-port.mjs")).href);
  const sp = await SP.ensureServicePort({ home: HOME, cfgDir: CFG_DIR, stateHome: path.join(HOME, "state"), env });
  if (env.LUMI_DEBUG) process.stderr.write(`lumitome: service port ${sp.port} (${sp.reason}) — ${sp.file}\n`);
}
try { fs.chmodSync(path.join(CFG_DIR, "service.json"), 0o600); } catch {}
// rules inti Lumitome dari config dir milik Lumitome (bukan proyek) → aktif di proyek mana pun walau trust off
finalCfg.instructions = fs.readdirSync(path.join(ROOT, "rules")).filter((f) => f.endsWith(".md")).sort().map((f) => path.join(CFG_DIR, "rules", f));
// hanya dir binary yang di-bind read-only ke sandbox — BUKAN seluruh LUMI_HOME (berisi jurnal, serve.password, data engine)
const toolDirs = [env.SW_HOME && path.join(env.SW_HOME, "bin"), path.resolve(path.dirname(process.execPath), "..")].filter((d) => d && path.relative(d, HOME).startsWith(".."));
Object.assign(env, {
  OPENCODE_CONFIG_DIR: CFG_DIR,
  OPENCODE_CONFIG_CONTENT: JSON.stringify(finalCfg),
  // engine terpin: tanpa cek/unduh update (diverifikasi di v2.2.4: OPENCODE_DISABLE_AUTOUPDATE → "update check skipped")
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_MODELS_FETCH: env.LUMI_MODELS_FETCH === "1" ? "" : "1", // tanpa fetch models.dev
  OPENCODE_DISABLE_CLAUDE_CODE: "1", // tidak membaca ~/.claude user
  XDG_DATA_HOME: env.LUMI_XDG_DATA || path.join(HOME, "data"),
  XDG_STATE_HOME: path.join(HOME, "state"), XDG_CACHE_HOME: path.join(HOME, "cache"),
  // isolasi dari instalasi OpenCode user: ~/.config/opencode, ~/.local/share/opencode (auth.json, sesi) tidak dibaca/ditulis
  XDG_CONFIG_HOME: path.join(HOME, "xdg-config"),
  PWD: WS, LUMI_WORKSPACE: WS, LUMI_JOURNAL: JOURNAL, LUMI_RUN_ID: RUN_ID,
  LUMI_HARNESS: path.join(REPO, "harness", "lumi-guard.mjs"),
  LUMI_TOOLDIRS: toolDirs.join(path.delimiter), LUMI_SBX_DIR: path.join(HOME, "sbx"),
  LUMI_9ROUTER_URL: env.LUMI_9ROUTER_URL || "http://127.0.0.1:20128/v1",
  ...FRAG.env,
});
// Windows: tidak ada bwrap → sandbox OS mati, tapi guard (deny rules, .env, anti-spin, push main) tetap aktif
// Windows: tanpa bwrap; guard tetap aktif. Pesan hanya dengan LUMI_DEBUG (layar TUI tidak diawali teks tambahan)
if (process.platform === "win32" && !env.LUMI_SANDBOX) { env.LUMI_SANDBOX = "off"; if (env.LUMI_DEBUG) process.stderr.write("lumitome: Windows, tanpa sandbox; guard aktif\n"); }
if (TRUST) process.stderr.write("lumitome: PERINGATAN — LUMI_TRUST_PROJECT=1: config, plugin, agent & MCP proyek di workspace ini DIMUAT dan dapat menjalankan kode. Pakai hanya untuk repo tepercaya.\n");
else { env.OPENCODE_DISABLE_PROJECT_CONFIG = "1"; }
env.SW_9ROUTER_URL ||= env.LUMI_9ROUTER_URL; env.SW_9ROUTER_KEY ||= env.NINEROUTER_API_KEY; // config proyek Swanwright
delete env.OPENCODE_CONFIG;
// service dipakai ulang hanya bila config/key/versi sama; beda → service lama milik LUMI_HOME dihentikan dulu
if (sub === "" || sub === "service") {
  const SCX = await import(pathToFileURL(path.join(ROOT, "lib", "service-ctl.mjs")).href);
  const fp = SCX.fingerprint([VERSION, env.OPENCODE_CONFIG_CONTENT, FRAG.env, env.LUMI_SANDBOX || "", env.LUMI_9ROUTER_URL || "", TRUST]);
  try { const r = SCX.ensureFresh(HOME, fp); if (env.LUMI_DEBUG) process.stderr.write(`lumitome: service ${r}\n`); } catch (e) { if (env.LUMI_DEBUG) process.stderr.write(`lumitome: cek service gagal (${e.message})\n`); }
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
function runOnce(a) {
  return new Promise((resolve) => {
    // setpriv --pdeathsig: opencode ikut mati bila wrapper kena SIGKILL (sisa MCP lalu dibersihkan reaper)
    const pd = HAS_SETPRIV ? ["setpriv", ["--pdeathsig", "SIGTERM", "--", ocBin(), ...a]] : [ocBin(), a];
    // TUI & subperintah interaktif: stdio diwariskan (TTY asli); run/serve: pipe (deteksi timeout / redaksi password)
    const piped = PIPED.has(sub);
    const child = spawn(pd[0], pd[1], { cwd: WS, env, stdio: piped ? ["inherit", "pipe", "pipe"] : "inherit" });
    let tail = "", out = "";
    const keep = (b) => { tail = (tail + b.toString()).slice(-8000); };
    if (piped) {
      child.stdout.on("data", (b) => { const t = redact(b.toString()); process.stdout.write(t); keep(t); out = (out + t).slice(-4000); });
      child.stderr.on("data", (b) => { const t = redact(b.toString()); process.stderr.write(t); keep(t); });
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
    child.on("exit", (code, sig) => { if (timer) clearTimeout(timer); if (wd) clearInterval(wd); for (const [s, h] of Object.entries(handlers)) process.off(s, h); resolve({ code: code ?? (sig ? 128 + 1 : 1), tail }); });
  });
}
const readJournal = () => { try { return fs.readFileSync(JOURNAL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const TIMEOUT_RE = /timeout|timed out|ETIMEDOUT|headerTimeout|chunkTimeout|TimeoutError|aborted due to timeout/i;

const DEADLINE = Date.now() + Number(env.LUMI_DEADLINE_MS || 300000); // batas keras run (default 5 menit)
let deadlineHit = false, stallHit = false;
// preflight provider (murah, ~0.3 s): GET {baseURL} — status HTTP apa pun (mis. 401) = server hidup.
// Server diam/hang → gagal cepat 124 tanpa menunggu retry internal OpenCode (~55 s/percobaan).
async function preflight() {
  const mi = args.indexOf("-m"), prov = mi >= 0 ? String(args[mi + 1]).split("/")[0] : "9router";
  const base = FRAG.providers[prov]?.settings.baseURL || env.LUMI_9ROUTER_URL, to = Number(env.LUMI_PREFLIGHT_TIMEOUT_MS || 8000), n = Number(env.LUMI_PREFLIGHT_RETRIES ?? 2);
  for (let i = 0; i <= n; i++) {
    const t0 = Date.now();
    // Promise.race: AbortSignal saja tidak menjamin batas waktu (DNS/TLS di threadpool bisa menggantung)
    try { await Promise.race([fetch(base, { signal: AbortSignal.timeout(to), headers: { "user-agent": `lumitome/${VERSION}` } }),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), to + 250).unref())]); return true; }
    catch (e) { process.stderr.write(`lumitome: preflight ${base} gagal (${e.name || e.message}, ${Date.now() - t0} ms) ${i < n ? `— ulang ${i + 1}/${n}` : ""}\n`); }
    if (i < n) await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
  return false;
}
if (sub === "run" && env.LUMI_PREFLIGHT !== "0" && !(await preflight())) {
  process.stderr.write(`lumitome: GAGAL — provider ${MODEL || env.LUMI_9ROUTER_URL} tidak merespons (preflight); tidak menjalankan opencode\n`); process.exit(124);
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
  }
  if (env.LUMI_DEBUG) process.stderr.write(`lumitome: jurnal ${JOURNAL} ${skillNote}\n`);
}
process.exit(code);
