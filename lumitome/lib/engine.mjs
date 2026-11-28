/**
 * Engine OpenCode terpin untuk Lumitome (dipakai instalasi npm: postinstall / first-run, dan `lumitome upgrade`).
 * Unduh aset rilis resmi → verifikasi SHA256 (hash terpin di sini) → ekstrak → $LUMI_HOME/bin/opencode[.exe].
 * Tanpa auto-update: engine hanya diganti lewat `lumitome upgrade` (cara gampang, versi + SHA256 terpin)
 * atau `lumitome upgrade-engine <versi> --sha256 <hash>` (manual/lanjutan).
 * Default: build Lumitome dari OpenCode v2.4.2 (hanya logo diganti, engine/patches/logo.patch), aset rilis
 * fahmi0812/Lumitome engine-2.4.2-lumi.1. LUMI_ENGINE=upstream → binary resmi OpenCode v2.4.2.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolveEnvValue } from "./env-compat.mjs";

export const OC_VERSION = "2.4.2";
export const ENGINE_MIN_2_4 = "2.4.2";
export const LUMI_ENGINE_TAG = "engine-2.4.2-lumi.1";
// SHA256 aset rilis fahmi0812/Lumitome engine-2.4.2-lumi.1 (sama dengan install.sh). Platform tanpa pin di sini → upstream.
export const LUMI_PINS = {
  "linux-x64": ["opencode-linux-x64.tar.gz", "7c9f9ac6c3ad45928c0d9eae019a160cc66a29446044e572dc081285700d6a8c"],
  "linux-arm64": ["opencode-linux-arm64.tar.gz", "0be7382b389ae91a6e9a0f75730bb00f811b6d52d3e0094c63c649b518d94372"],
  "darwin-x64": ["opencode-darwin-x64.zip", "11eb5e44b0d4d05a903534bcb96c7e3dad384765bc9b8091bc1874e718b03f31"],
  "darwin-arm64": ["opencode-darwin-arm64.zip", "0e8533a065302083caf992d2fd3cf6c4ed38cb5caf95609c0adadd9be45319d7"],
  "win32-x64": ["opencode-windows-x64.zip", "63000632ebc7469ba06a10928f24697c49037a34f6e11a72eec2dad6f5d87e8e"],
  "win32-arm64": ["opencode-windows-arm64.zip", "dc471e947ef1010c76db4b65f900b689134ad695890c9c8e729fbf9389ad6fed"],
};
/** "lumi" (default) atau "upstream" (LUMI_ENGINE=upstream). */
export const engineFlavor = (env = process.env) => (String(env.LUMI_ENGINE || "").toLowerCase() === "upstream" ? "upstream" : "lumi");
// SHA256 dari SHA256SUMS rilis anomalyco/opencode v2.4.2 (sama dengan install.sh)
export const OC_PINS = {
  "linux-x64": ["opencode-linux-x64.tar.gz", "452912288f934d1771bd5bd0d8611ba3a6adc3db3ac3333c37facf373770ba66"],
  "linux-arm64": ["opencode-linux-arm64.tar.gz", "bf8d18dde87224629341ff398e76c7c17216b9b406affc728b6c1a5c136abf93"],
  "darwin-x64": ["opencode-darwin-x64.zip", "ea4204a75602ce4f1d2121c781a15fa3af6d1c4285cf8b6ae81f61a76deca2a2"],
  "darwin-arm64": ["opencode-darwin-arm64.zip", "d5a8c9fb4b121ebd531d9369d7ba6ce8af91c9d4d51d6685dbb4e0c7224fa5f3"],
  "win32-x64": ["opencode-windows-x64.zip", "a8ab3034ca5b3ec8476e9ee73b1dc334b6d8e93edaaf224b3d2a5205e2cbfb99"],
  "win32-arm64": ["opencode-windows-arm64.zip", "0081574c145d60fc6b0079db558ca1b071394b8ccc4549424dec0acb66706942"],
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

/** Resolusi versi target engine (LUMI_ENGINE_VERSION > opts.installedVersion > OC_VERSION terpin). */
export function resolveEngineVersion(env = process.env, opts = {}) {
  const raw = String(env?.LUMI_ENGINE_VERSION || "").trim();
  if (raw) return raw;
  const inst = String(opts?.installedVersion || "").trim();
  if (inst) return inst;
  return OC_VERSION;
}

/** Deteksi cepat versi engine terpasang aktual: baca tag flavor tanpa spawn jika bertag; fallback ke --version. */
export function detectInstalledEngineVersion({ bin, env = process.env } = {}) {
  if (!bin) return null;
  const fl = installedFlavor(bin);
  const m = fl?.match(/^engine-(\d+\.\d+\.\d+)-/);
  if (m) return m[1];
  if (fs.existsSync(bin)) return engineVersion(bin, env) || null;
  return null;
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

/** Versi engine terpasang ("2.4.2") atau null. Dijalankan dengan XDG terisolasi. */
export function engineVersion(bin, env) {
  try { return execFileSync(bin, ["--version"], { encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"], timeout: 30000 }).trim().replace(/^.*?v?(\d+\.\d+\.\d+).*$/s, "$1"); } catch { return null; }
}

/** Penanda build engine terpasang (engine-2.4.2-lumi.1 / upstream) di samping binary; null bila tidak ada (instalasi lama). */
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
