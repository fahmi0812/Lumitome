#!/usr/bin/env node
/**
 * postinstall npm: pasang engine OpenCode terpin (SHA256) ke LUMI_HOME + bangun indeks skill.
 * Tidak pernah menggagalkan `npm install`: bila gagal (offline, dsb.), engine dipasang saat `lumitome` pertama kali dijalankan.
 * Lewati dengan LUMI_SKIP_ENGINE_DOWNLOAD=1.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lumiHome, engineBin, engineVersion, installEngine, OC_VERSION } from "../lib/engine.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const say = (m) => process.stderr.write(`lumitome postinstall: ${m}\n`);
const inRepoCheckout = fs.existsSync(path.join(REPO, ".git"));
try {
  if (!inRepoCheckout || process.env.LUMI_POSTINSTALL_FORCE === "1") {
    const ix = spawnSync(process.execPath, ["--no-warnings", "scripts/skill-index.mjs", "--if-changed"], { cwd: REPO, encoding: "utf8" });
    say(ix.status === 0 ? "indeks skill siap" : `indeks skill gagal (router skill nonaktif): ${(ix.stderr || "").trim().split("\n").pop()}`);
  }
  if (process.env.LUMI_SKIP_ENGINE_DOWNLOAD === "1" || (inRepoCheckout && process.env.LUMI_POSTINSTALL_FORCE !== "1")) process.exit(0);
  const home = lumiHome();
  fs.mkdirSync(path.join(home, "bin"), { recursive: true });
  if (!fs.existsSync(path.join(home, ".lumitome-home"))) fs.writeFileSync(path.join(home, ".lumitome-home"), "");
  const bin = engineBin(home);
  if (engineVersion(bin, { ...process.env, XDG_STATE_HOME: path.join(home, "state"), XDG_DATA_HOME: path.join(home, "data"), XDG_CONFIG_HOME: path.join(home, "xdg-config"), XDG_CACHE_HOME: path.join(home, "cache"), OPENCODE_DISABLE_AUTOUPDATE: "1" }) === OC_VERSION) say(`engine v${OC_VERSION} sudah ada (${bin})`);
  else await installEngine({ home, log: say });
  // codebase-memory-mcp (codemem) terpin — gagal tidak fatal (dicoba lagi saat first-run)
  if (process.env.LUMI_SKIP_CBM_DOWNLOAD !== "1") {
    const CM = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "codemem.mjs")).href);
    if (CM.cbmVersion(CM.cbmBin(home)) === CM.CBM_VERSION) say(`codebase-memory-mcp v${CM.CBM_VERSION} sudah ada`);
    else await CM.installCbm({ home, log: say }).catch((e) => say(`codebase-memory-mcp dilewati (${e.message}); dicoba lagi saat 'lumitome' pertama kali dijalankan`));
  }
} catch (e) { say(`dilewati (${e.message}); engine akan dipasang saat 'lumitome' pertama kali dijalankan`); }
