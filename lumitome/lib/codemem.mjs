/**
 * codebase-memory-mcp ("codemem") untuk Lumitome: binary terpin (SHA256) di $LUMI_HOME/bin, MCP global, auto-index.
 * TIDAK PERNAH menjalankan `codebase-memory-mcp install` (itu menulis config klien lain).
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

export const CBM_VERSION = "0.12.1"; // sama dengan install.sh
// SHA256 dari checksums.txt rilis DeusData/codebase-memory-mcp v0.12.1
export const CBM_PINS = {
  "linux-x64": ["codebase-memory-mcp-linux-amd64.tar.gz", "8453015145f072c1b9b019cbdd02cea8cc6f18cc5e116036dd20992631c638c7"],
  "linux-arm64": ["codebase-memory-mcp-linux-arm64.tar.gz", "8575f126092660b93b170bdc2e06f3ef2dd28d3cc49ad6d0895dc3e4767219cd"],
  "darwin-x64": ["codebase-memory-mcp-darwin-amd64.tar.gz", "ca6e64397a8ae80cec898a8205a6aa16750ac798acc05a0c3ed983837944a581"],
  "darwin-arm64": ["codebase-memory-mcp-darwin-arm64.tar.gz", "9bfcbe38414b47969a3e1d1c1999f5357409387c86fa3d24221b5458267660d2"],
  "win32-x64": ["codebase-memory-mcp-windows-amd64.zip", "4e4e0f16b45233af5c757a1fcbe3c3b16e9056375b1fbe2ce020b6de75dedcc0"],
  "win32-arm64": ["codebase-memory-mcp-windows-arm64.zip", "934ab6bd67a76c6ebd9e110d87b7090ffd629919bedaeddabe5a19175038b063"],
};
export const cbmExe = (platform = process.platform) => (platform === "win32" ? "codebase-memory-mcp.exe" : "codebase-memory-mcp");
export function cbmBin(home, platform = process.platform, p = platform === "win32" ? path.win32 : path) { return p.join(home, "bin", cbmExe(platform)); }
export function cbmAsset(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch === "arm64" ? "arm64" : "x64"}`; const pin = CBM_PINS[key];
  if (!pin) return null;
  return { key, name: pin[0], sha256: pin[1], url: `https://github.com/DeusData/codebase-memory-mcp/releases/download/v${CBM_VERSION}/${pin[0]}` };
}
/** Definisi MCP codemem (mode MCP = tanpa argumen, stdio) atau null bila binary tidak ada. */
export const SHIM = fileURLToPath(new URL("./codemem-mcp-shim.mjs", import.meta.url));
/** Batas start MCP codemem (ms). Binary siap < 2 s; 60 s lama membuat folder menunggu bila binary macet. */
export const CODEMEM_STARTUP_MS = 15000;
/**
 * Definisi MCP codemem. Dijalankan lewat shim Node: engine memulai MCP dengan cwd = folder sesi, dan shim hanya
 * menjalankan binary di dalam repo git. Di luar git shim menjawab MCP tanpa tool (cepat, tanpa binary 330 MB).
 */
export function codememServer(home, exists = fs.existsSync, nodeExec = process.execPath) {
  const bin = cbmBin(home); if (!exists(bin)) return null;
  return { type: "local", command: [nodeExec, "--no-warnings", SHIM, bin], timeout: { startup: CODEMEM_STARTUP_MS, catalog: 60000, execution: 600000 } };
}
/** Root repo git terdekat (folder berisi .git, file atau dir) atau null. Path Windows & POSIX. */
export function gitRoot(dir, { exists = fs.existsSync, p = path } = {}) {
  let d = p.resolve(dir);
  for (;;) {
    if (exists(p.join(d, ".git"))) return d;
    const up = p.dirname(d); if (up === d) return null; d = up;
  }
}
export function cbmVersion(bin) {
  try { return execFileSync(bin, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30000 }).trim().replace(/^.*?(\d+\.\d+\.\d+).*$/s, "$1"); } catch { return null; }
}
function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findFile(f, name); if (r) return r; } else if (e.name === name) return f;
  }
  return null;
}
/** Pasang binary terpin ke $home/bin. Melempar error bila gagal (pemanggil memperlakukannya non-fatal). */
export async function installCbm({ home, log = (m) => process.stderr.write(m + "\n"), fetchImpl = fetch }) {
  const a = cbmAsset(); if (!a) throw new Error(`platform ${process.platform}-${process.arch} tidak didukung`);
  const dst = cbmBin(home);
  log(`lumitome: mengunduh codebase-memory-mcp v${CBM_VERSION} (${a.name})…`);
  const res = await fetchImpl(a.url); if (!res.ok) throw new Error(`unduh gagal: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer()); const got = crypto.createHash("sha256").update(buf).digest("hex");
  if (got !== a.sha256) throw new Error(`SHA256 tidak cocok untuk ${a.name}: ${got} != ${a.sha256}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-cbm-"));
  try {
    const arc = path.join(tmp, a.name); fs.writeFileSync(arc, buf); const x = path.join(tmp, "x"); fs.mkdirSync(x);
    if (a.name.endsWith(".tar.gz")) execFileSync("tar", ["-xzf", arc, "-C", x]);
    else { try { execFileSync("tar", ["-xf", arc, "-C", x], { stdio: "ignore" }); } catch { execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${arc}' -DestinationPath '${x}' -Force`]); } }
    const bin = findFile(x, cbmExe()); if (!bin) throw new Error(`${cbmExe()} tidak ada di ${a.name}`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const part = `${dst}.${process.pid}.part`; fs.copyFileSync(bin, part); fs.chmodSync(part, 0o755);
    fs.rmSync(dst, { force: true }); fs.renameSync(part, dst);
    log(`lumitome: SHA256 terverifikasi; codebase-memory-mcp → ${dst}`);
    return dst;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export const PROJECT_MARKERS = [".git", "package.json", "pyproject.toml", "setup.py", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "Gemfile", "mix.exs", "deno.json", "CMakeLists.txt", "Makefile", "pubspec.yaml", "Package.swift", ".hg"];
const SYSTEM_DIRS = ["/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/run", "/sbin", "/sys", "/usr", "/var", "/System", "/Library", "/Applications", "/private"];
/** Alasan auto-index dilewati, atau null bila boleh. */
export function autoIndexSkip(dir, { home = os.homedir(), platform = process.platform, exists = fs.existsSync, env = process.env } = {}) {
  if (env.LUMI_AUTO_INDEX === "0") return "LUMI_AUTO_INDEX=0";
  const p = platform === "win32" ? path.win32 : path.posix;
  const norm = (s) => { const r = p.resolve(s); return platform === "win32" ? r.toLowerCase() : r; };
  const d = norm(dir);
  if (d === norm(home)) return "folder home";
  if (d === p.parse(d).root) return "folder root";
  if (platform === "win32") { if (/^[a-z]:\\(windows|program files( \(x86\))?|programdata)(\\|$)/i.test(d)) return "folder sistem"; }
  else if (SYSTEM_DIRS.some((s) => d === s || d.startsWith(s + "/")) && !d.startsWith(norm(home) + "/")) return "folder sistem";
  if (!PROJECT_MARKERS.some((m) => exists(p.join(dir, m)))) return "bukan folder proyek";
  return null;
}
const stateFile = (home) => path.join(home, "codemem-index.json");
export function readIndexState(home) { try { return JSON.parse(fs.readFileSync(stateFile(home), "utf8")); } catch { return {}; } }
export function writeIndexState(home, dir, rec) {
  const s = readIndexState(home); s[dir] = { ...s[dir], ...rec }; fs.writeFileSync(stateFile(home), JSON.stringify(s, null, 1));
}
/** Mulai indeks di latar (detached, prioritas rendah). Return status singkat. */
export function maybeAutoIndex({ home, dir, env = process.env, nodeExec = process.execPath, runner }) {
  const bin = cbmBin(home); if (!fs.existsSync(bin)) return "no-binary";
  const why = autoIndexSkip(dir, { env }); if (why) return `skip:${why}`;
  if (!gitRoot(dir)) return "skip:bukan repo git";
  const st = readIndexState(home)[dir];
  if (st?.status === "indexed") return "already";
  if (st?.status === "running" && Date.now() - (st.started || 0) < 30 * 60000) return "running";
  writeIndexState(home, dir, { status: "running", started: Date.now() });
  const child = spawn(nodeExec, [runner, home, dir, bin], { detached: true, stdio: "ignore", env, windowsHide: true });
  try { os.setPriority(child.pid, 19); } catch {}
  child.unref();
  return "started";
}
