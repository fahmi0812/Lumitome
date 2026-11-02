/**
 * Engine OpenCode terpin untuk Lumitome (dipakai instalasi npm: postinstall / first-run, dan upgrade-engine).
 * Unduh aset rilis resmi → verifikasi SHA256 (hash terpin di sini) → ekstrak → $LUMI_HOME/bin/opencode[.exe].
 * Tanpa auto-update: engine hanya diganti lewat `lumitome upgrade-engine`.
 * Default: build Lumitome dari OpenCode v2.2.4 (hanya logo diganti, engine/patches/logo.patch), aset rilis
 * fahmi0812/Lumitome engine-2.2.4-lumi.1. LUMI_ENGINE=upstream → binary resmi OpenCode v2.2.4.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const OC_VERSION = "2.2.4";
export const LUMI_ENGINE_TAG = "engine-2.2.4-lumi.1";
// SHA256 aset rilis fahmi0812/Lumitome engine-2.2.4-lumi.1 (sama dengan install.sh). Platform tanpa pin di sini → upstream.
export const LUMI_PINS = {
  "linux-x64": ["opencode-linux-x64.tar.gz", "be6d3d72ee5de8e8db2fa3409ecf690b41590b5b639838e81ad6d5f9e4c2d0cb"],
  "linux-arm64": ["opencode-linux-arm64.tar.gz", "47a0a48a23a37d5976aa4ca354ed83a1bc9c8d633991e4075f1d4124598508e6"],
  "darwin-x64": ["opencode-darwin-x64.zip", "14c6d9a29be862112417fec61e3413105e619783af4c44c3c55c6d38df1e7482"],
  "darwin-arm64": ["opencode-darwin-arm64.zip", "ce0b62ac9baad5bd7146c53892d879832bd3fcc9e0e579b81ba5e0d76b0e5284"],
  "win32-x64": ["opencode-windows-x64.zip", "4f99c1369ad42def436448416bdd806982de9f84564f1ae77ba463c28fb944ba"],
  "win32-arm64": ["opencode-windows-arm64.zip", "fe91e73d55269222581d1e4c591349f7ae4bba7974752623b8d3eac972fed456"],
};
/** "lumi" (default) atau "upstream" (LUMI_ENGINE=upstream). */
export const engineFlavor = (env = process.env) => (String(env.LUMI_ENGINE || "").toLowerCase() === "upstream" ? "upstream" : "lumi");
// SHA256 dari SHA256SUMS rilis anomalyco/opencode v2.2.4 (sama dengan install.sh)
export const OC_PINS = {
  "linux-x64": ["opencode-linux-x64.tar.gz", "1b70ce4a88e27c3643c2bb61c757dfe173b4e3629926ce808d45f3774d87826e"],
  "linux-arm64": ["opencode-linux-arm64.tar.gz", "81edcae078f36356cde3cf57d0cc6627896b18d1bddf47317cb025c56fcffd93"],
  "darwin-x64": ["opencode-darwin-x64.zip", "2be9b7671f94a9636b85ff31fcfce613f197c5204ec90291982d692010d072fd"],
  "darwin-arm64": ["opencode-darwin-arm64.zip", "4e093cae2931773c354896d98e7da0cfa3607c110aeaf255ba07f9c2d2238219"],
  "win32-x64": ["opencode-windows-x64.zip", "8255fa4808b9ed1bfbc5a4f50c800cabc3a88e66f0d67d0f87bd38cce32f7321"],
  "win32-arm64": ["opencode-windows-arm64.zip", "ad20a596f664bce9fccd87215e138c4bc4f823162d50b6779f5cee8d74100bd0"],
};

/** LUMI_HOME default: ~/.lumitome (Windows: %USERPROFILE%\.lumitome). */
export function lumiHome(env = process.env, p = path, home = os.homedir()) { return env.LUMI_HOME || p.join(home, ".lumitome"); }
export const exeName = (platform = process.platform) => (platform === "win32" ? "opencode.exe" : "opencode");
export function engineBin(home, platform = process.platform, p = platform === "win32" ? path.win32 : path) { return p.join(home, "bin", exeName(platform)); }
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

/** Versi engine terpasang ("2.2.4") atau null. Dijalankan dengan XDG terisolasi. */
export function engineVersion(bin, env) {
  try { return execFileSync(bin, ["--version"], { encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"], timeout: 30000 }).trim().replace(/^.*?v?(\d+\.\d+\.\d+).*$/s, "$1"); } catch { return null; }
}

/** Penanda build engine terpasang (engine-2.2.4-lumi.1 / upstream) di samping binary; null bila tidak ada (instalasi lama). */
export const flavorFile = (bin) => `${bin}.flavor`;
export function installedFlavor(bin) { try { return fs.readFileSync(flavorFile(bin), "utf8").trim() || null; } catch { return null; } }
/** Build yang diinginkan untuk platform ini (pin Lumitome ada → tag Lumitome; lainnya upstream). */
export const wantedFlavor = (env = process.env, platform = process.platform, arch = process.arch) => assetFor(OC_VERSION, platform, arch, engineFlavor(env)).flavor;

/** Pastikan engine terpasang & build-nya sesuai (lumi/upstream). Engine 2.2.4 yang sudah jalan tidak pernah dihapus bila unduhan gagal;
 *  tanpa engine sama sekali dan build Lumitome gagal → coba upstream 2.2.4. */
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
