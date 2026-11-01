#!/usr/bin/env node
/**
 * Entry `lumitome` untuk instalasi npm (Windows / macOS / Linux) — tanpa bash.
 * Menyiapkan LUMI_HOME (~/.lumitome, Windows: %USERPROFILE%\.lumitome), memasang engine OpenCode terpin
 * (SHA256) bila belum ada, lalu menjalankan wrapper lumitome.mjs dengan Node yang sama.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lumiHome, engineBin, engineVersion, installEngine, OC_VERSION } from "../lib/engine.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 6)) { process.stderr.write(`lumitome: butuh Node.js >= 22.6 (sekarang ${process.versions.node}). Unduh di https://nodejs.org\n`); process.exit(1); }

const env = { ...process.env };
const home = lumiHome(env);
env.LUMI_HOME = home; env.SW_HOME = home; env.LUMI_INSTALL ||= "npm";
fs.mkdirSync(path.join(home, "bin"), { recursive: true });
if (!fs.existsSync(path.join(home, ".lumitome-home"))) fs.writeFileSync(path.join(home, ".lumitome-home"), "");
const bin = env.LUMI_OPENCODE || engineBin(home);
const isoEnv = { ...env, XDG_CONFIG_HOME: path.join(home, "xdg-config"), XDG_DATA_HOME: path.join(home, "data"), XDG_STATE_HOME: path.join(home, "state"), XDG_CACHE_HOME: path.join(home, "cache"), OPENCODE_DISABLE_AUTOUPDATE: "1" };
if (!env.LUMI_OPENCODE && engineVersion(bin, isoEnv) === null) {
  try { await installEngine({ home }); }
  catch (e) { process.stderr.write(`lumitome: gagal memasang engine OpenCode v${OC_VERSION}: ${e.message}\n`); process.exit(1); }
}
env.LUMI_OPENCODE = bin;
// tools milik LUMI_HOME (codebase-memory-mcp/uv bila ada) di depan PATH
const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") || "PATH";
env[key] = [path.join(home, "bin"), env[key]].filter(Boolean).join(path.delimiter);

const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(HERE, "lumitome.mjs"), ...process.argv.slice(2)], { stdio: "inherit", env });
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => { try { child.kill(s); } catch {} });
child.on("exit", (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
