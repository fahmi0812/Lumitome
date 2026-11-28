/**
 * Engine OpenCode terpin untuk Lumitome (dipakai instalasi npm: postinstall / first-run, dan `lumitome upgrade`).
 * Unduh aset rilis resmi → verifikasi SHA256 (hash terpin di sini) → ekstrak → $LUMI_HOME/bin/opencode[.exe].
 * Tanpa auto-update: engine hanya diganti lewat `lumitome upgrade` (cara gampang, versi + SHA256 terpin)
 * atau `lumitome upgrade-engine <versi> --sha256 <hash>` (manual/lanjutan).
 * Default: build Lumitome dari OpenCode v2.3.0 (hanya logo diganti, engine/patches/logo.patch), aset rilis
 * fahmi0812/Lumitome engine-2.3.0-lumi.1. LUMI_ENGINE=upstream → binary resmi OpenCode v2.3.0.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolveEnvValue } from "./env-compat.mjs";

export const OC_VERSION = "2.3.0";
export const ENGINE_MIN_2_4 = "2.4.2";
export const LUMI_ENGINE_TAG = "engine-2.3.0-lumi.1";
// SHA256 aset rilis fahmi0812/Lumitome engine-2.3.0-lumi.1 (sama dengan install.sh). Platform tanpa pin di sini → upstream.
export const LUMI_PINS = {
  "linux-x64": ["opencode-linux-x64.tar.gz", "0e8328e8b307795065a87263c196c03ff36dd6f7fe366cb420603b3b8758df72"],
  "linux-arm64": ["opencode-linux-arm64.tar.gz", "ea3a63340b9d82bd6cbb7ab8566f0bb8bba79426840482050d9d020c5515d594"],
  "darwin-x64": ["opencode-darwin-x64.zip", "de1cf6c6344079f69e2323feb6fec21ac078fd79daf97825672624dff0a2af80"],
  "darwin-arm64": ["opencode-darwin-arm64.zip", "1be236bce5fe504372f3966efeb24bd43f37f0221fc737ace141b6b698b515c5"],
  "win32-x64": ["opencode-windows-x64.zip", "ce6ec6abb00bce2b13ed7ac14beb84b6fd7ce551fa855c519059326dbc87add3"],
  "win32-arm64": ["opencode-windows-arm64.zip", "740fc1a6b426b545cc873d026d3a9916b3b80387d566fc119f0af45443ff68d3"],
};
/** "lumi" (default) atau "upstream" (LUMI_ENGINE=upstream). */
export const engineFlavor = (env = process.env) => (String(env.LUMI_ENGINE || "").toLowerCase() === "upstream" ? "upstream" : "lumi");
// SHA256 dari SHA256SUMS rilis anomalyco/opencode v2.3.0 (sama dengan install.sh)
export const OC_PINS = {
  "linux-x64": ["opencode-linux-x64.tar.gz", "fc0f81522aceeabac47693d88389efa2bc517ce74c2c38fd6967819fcc6e4d3b"],
  "linux-arm64": ["opencode-linux-arm64.tar.gz", "3207fb5cdec448d479242c0f1a14f4f7bdfcad3a79209b5eb8f9003725e93711"],
  "darwin-x64": ["opencode-darwin-x64.zip", "79a4841925e3344d5bb4b000acf6c50b11de301e9047aa9bea9e288e77fe4249"],
  "darwin-arm64": ["opencode-darwin-arm64.zip", "7907df2b12720a840fbb49c5b978b9b82925b6bf75479a5fd216afa8932b6702"],
  "win32-x64": ["opencode-windows-x64.zip", "2e14eee53f4abad803d55fdc472c1b12dc3802d687ae204f81e7908bd2ab1895"],
  "win32-arm64": ["opencode-windows-arm64.zip", "86217da9616447404b96c599bee08a1c2d932c92fb58b0f60cfe835e2b61926a"],
};

/** LUMI_HOME default: ~/.lumitome (Windows: %USERPROFILE%\.lumitome). */
export function lumiHome(env = process.env, p = path, home = os.homedir()) {
  return resolveEnvValue(env, "LUMI_HOME", ["SW_HOME"]) || p.join(home, ".lumitome"); // env-compat-allow
}
export const exeName = (platform = process.platform) => (platform === "win32" ? "opencode.exe" : "opencode");
export function engineBin(home, platform = process.platform, p = platform === "win32" ? path.win32 : path) { return p.join(home, "bin", exeName(platform)); }

/** Bandingkan versi semver secara numerik (true bila ver >= minVer; lulus "2.10.0" >= "2.4.2"). */
export function engineAtLeast(ver, minVer = ENGINE_MIN_2_4) {
  const mA = String(ver || "").match(/(\d+)\.(\d+)\.(\d+)/);
  const mB = String(minVer || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!mA || !mB) return false;
  const a = [Number(mA[1]), Number(mA[2]), Number(mA[3])];
  const b = [Number(mB[1]), Number(mB[2]), Number(mB[3])];
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

/** Resolusi versi target engine (LUMI_ENGINE_VERSION menimpa OC_VERSION terpin). */
export function resolveEngineVersion(env = process.env) {
  const raw = String(env?.LUMI_ENGINE_VERSION || "").trim();
  return raw || OC_VERSION;
}

/** Resolusi binary engine: LUMI_ENGINE_BIN > LUMI_OPENCODE > $LUMI_HOME/bin/opencode > ~/.lumitome/bin/opencode > PATH. */
export function resolveEngineBin({ env = process.env, home = lumiHome(env), platform = process.platform, exists = fs.existsSync } = {}) {
  const explicit = String(env?.LUMI_ENGINE_BIN || "").trim();
  if (explicit) return explicit;
  const legacy = String(env?.LUMI_OPENCODE || "").trim();
  if (legacy) return legacy;
  const exe = exeName(platform);
  for (const d of [home, path.join(os.homedir(), ".lumitome")]) {
    if (!d) continue;
    const candidate = path.join(d, "bin", exe);
    if (exists(candidate)) return candidate;
  }
  return exe;
}
export function platformKey(platform = process.platform, arch = process.arch) { return `${platform}-${arch === "arm64" ? "arm64" : "x64"}`; }
export function assetFor(version = OC_VERSION, platform = process.platform, arch = process.arch, flavor = engineFlavor()) {
  const key = platformKey(platform, arch);
  const lp = version === OC_VERSION && flavor === "lumi" ? LUMI_PINS[key] : null;
  if (lp) return { key, name: lp[0], sha256: lp[1], flavor: LUMI_ENGINE_TAG, url: `https://github.com/fahmi0812/Lumitome/releases/download/${LUMI_ENGINE_TAG}/${lp[0]}` };
  const pin = version === OC_VERSION ? OC_PINS[key] : null;
  const name = pin ? pin[0] : `opencode-${platform === "win32" ? "windows" : platform}-${key.split("-")[1]}.${platform === "linux" ? "tar.gz" : "zip"}`;
  return { key, name, sha256: pin?.[1], flavor: "upstream", url: `https://github.com/anomalyco/opencode/releases/download/v${version}/${name}` };
}
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findFile(f, name); if (r) return r; } else if (e.name === name) return f;
  }
  return null;
}
function extract(archive, dir) {
  if (archive.endsWith(".tar.gz")) return execFileSync("tar", ["-xzf", archive, "-C", dir]);
  if (process.platform === "win32") {
    try { return execFileSync("tar", ["-xf", archive, "-C", dir], { stdio: "ignore" }); } // bsdtar bawaan Windows 10+
    catch { return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dir}' -Force`]); }
  }
  return execFileSync("unzip", ["-qo", archive, "-d", dir]);
}

/** Pasang engine ke dst (default $home/bin/opencode[.exe]). sha256 wajib (terpin atau dari argumen). */
export async function installEngine({ home, version = OC_VERSION, sha: want, dst, flavor = engineFlavor(), log = (m) => process.stderr.write(m + "\n"), fetchImpl = fetch }) {
  const a = want ? assetFor(version, process.platform, process.arch, "upstream") : assetFor(version, process.platform, process.arch, flavor); const expect = want || a.sha256;
  if (!expect) throw new Error(`tidak ada SHA256 terpin untuk ${a.key} v${version}`);
  dst ||= engineBin(home);
  log(`lumitome: mengunduh engine OpenCode v${version} (${a.name}, ${a.flavor})…`);
  const res = await fetchImpl(a.url); if (!res.ok) throw new Error(`unduh gagal: HTTP ${res.status} ${a.url}`);
  const buf = Buffer.from(await res.arrayBuffer()); const got = sha256(buf);
  if (got !== expect) throw new Error(`SHA256 tidak cocok untuk ${a.name}: ${got} != ${expect}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-eng-"));
  try {
    const arc = path.join(tmp, a.name); fs.writeFileSync(arc, buf); fs.mkdirSync(path.join(tmp, "x"));
    extract(arc, path.join(tmp, "x"));
    const bin = findFile(path.join(tmp, "x"), exeName()); if (!bin) throw new Error(`${exeName()} tidak ada di ${a.name}`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const part = `${dst}.${process.pid}.part`; fs.copyFileSync(bin, part); fs.chmodSync(part, 0o755);
    fs.rmSync(dst, { force: true }); fs.renameSync(part, dst);
    try { fs.writeFileSync(flavorFile(dst), a.flavor + "\n"); } catch {}
    log(`lumitome: SHA256 terverifikasi; engine → ${dst}`);
    return dst;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** Versi engine terpasang ("2.3.0") atau null. Dijalankan dengan XDG terisolasi. */
export function engineVersion(bin, env) {
  try { return execFileSync(bin, ["--version"], { encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"], timeout: 30000 }).trim().replace(/^.*?v?(\d+\.\d+\.\d+).*$/s, "$1"); } catch { return null; }
}

/** Penanda build engine terpasang (engine-2.3.0-lumi.1 / upstream) di samping binary; null bila tidak ada (instalasi lama). */
export const flavorFile = (bin) => `${bin}.flavor`;
export function installedFlavor(bin) { try { return fs.readFileSync(flavorFile(bin), "utf8").trim() || null; } catch { return null; } }
/** Build yang diinginkan untuk platform ini (pin Lumitome ada → tag Lumitome; lainnya upstream). */
export const wantedFlavor = (env = process.env, platform = process.platform, arch = process.arch) => assetFor(OC_VERSION, platform, arch, engineFlavor(env)).flavor;

/** Pastikan engine terpasang & build-nya sesuai (lumi/upstream). Engine yang sudah jalan tidak pernah dihapus bila unduhan gagal;
 *  tanpa engine sama sekali dan build Lumitome gagal → coba upstream. Engine
 *  versi lain yang sudah terpasang (mis. pilihan eksplisit via upgrade-engine)
 *  tidak ditimpa di sini — engine hanya diganti lewat `lumitome upgrade` / `upgrade-engine`. */
export async function ensureEngine({ home, bin = engineBin(home), env = process.env, log = (m) => process.stderr.write(m + "\n"), fetchImpl = fetch }) {
  const v = engineVersion(bin, env), want = wantedFlavor(env), have = installedFlavor(bin) || "upstream";
  if (v !== null && (v !== OC_VERSION || have === want)) return { installed: false, flavor: have };
  try { await installEngine({ home, dst: bin, flavor: engineFlavor(env), log, fetchImpl }); return { installed: true, flavor: want }; }
  catch (e) {
    if (v !== null) { log(`lumitome: engine ${want} belum bisa dipasang (${e.message}); tetap memakai engine yang ada`); return { installed: false, flavor: have }; }
    if (want === "upstream") throw e;
    log(`lumitome: engine ${want} gagal (${e.message}); memakai OpenCode v${OC_VERSION} resmi`);
    await installEngine({ home, dst: bin, flavor: "upstream", log, fetchImpl }); return { installed: true, flavor: "upstream" };
  }
}
