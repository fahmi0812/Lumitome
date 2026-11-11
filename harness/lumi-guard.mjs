/**
 * Lumitome guard — keputusan kebijakan shell/file yang deterministik & fail-closed.
 * Dipakai plugin runtime (lumitome/config/plugins/lumitome-guard.ts) dan unit test.
 * Tidak bergantung pada urutan merge config OpenCode: plugin memanggil ini di tool.execute.before.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

// ---------- pola rahasia ----------
// .env, .env.local, .env.production … (BUKAN .env.example / .env.sample / .env.template)
const ENV_FILE = /(?:^|[\s'"`=\/<>(:;|&,])\.env(?:\.(?!(?:example|sample|template)(?![\w.-]))[\w.-]+)?(?=$|[\s'"`;|&)<>,])/;
const ENV_GLOB = /(?:^|[\s'"`=\/<>(:])\.e[\w]*[*?\[]|\.env[*?\[]|\.env\.\*/; // .env*, .en?, .e*
const SECRET_PATHS = [
  /(?:^|[\/\s'"`])secrets\.env\b/, /\bid_(?:rsa|dsa|ecdsa|ed25519)\b/, /(?:^|[\s'"`])~?\/?\.ssh\//, /\.aws\/credentials\b/,
  /(?:^|[\/\s'"`])\.netrc\b/, /(?:^|[\/\s'"`])\.git-credentials\b/, /(?:^|[\/\s'"`])\.npmrc\b/, /(?:^|[\/\s'"`])\.pypirc\b/,
  /\/proc\/[^\s]*\/environ\b/,
];
// dump env berisi key provider
const ENV_DUMP = /(?:^|[;&|(\s`])(?:printenv|env|export\s+-p|set|declare\s+-x)(?=$|[\s;&|)`])(?!\s*[A-Za-z_]+=)/;
const KEY_VAR = /\$\{?(?:NINEROUTER_API_KEY|SW_9ROUTER_KEY|LUMI_9ROUTER_KEY|[A-Z_]*(?:API_KEY|TOKEN|SECRET)[A-Z_]*)\}?/;

export function isSecretPath(p) {
  const s = " " + String(p || "") + " ";
  return ENV_FILE.test(s) || ENV_GLOB.test(s) || SECRET_PATHS.some((r) => r.test(s)) || isHomeSecret(p);
}

// ---------- tokenisasi shell sederhana (fail-closed) ----------
/** Pecah perintah jadi segmen di ; && || | & newline, buka sh -c/bash -c/eval. */
export function segments(cmd) {
  const out = [];
  const parts = String(cmd).split(/\|\||&&|[;\n|&]/);
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    const m = p.match(/^(?:\S*\/)?(?:sh|bash|zsh|dash)\s+(?:-\w*c\w*)\s+(['"])([\s\S]*)\1\s*$/);
    if (m) { out.push(...segments(m[2])); continue; }
    out.push(p);
  }
  // substitusi $(...) dan `...`
  for (const m of String(cmd).matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) out.push(...segments(m[1] ?? m[2]));
  return out;
}
export function words(seg) {
  const w = []; const re = /"((?:\\.|[^"])*)"|'([^']*)'|(\S+)/g; let m;
  while ((m = re.exec(seg))) w.push(m[1] ?? m[2] ?? m[3]);
  return w;
}

function resolveIn(ws, p) {
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(ws, p);
}
function inside(ws, abs) { const r = path.relative(ws, abs); return r !== "" && !r.startsWith("..") && !path.isAbsolute(r); }

function currentBranch(ws) {
  try { return execFileSync("git", ["-C", ws, "symbolic-ref", "--quiet", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

/** Perintah yang hanya melihat NAMA/keberadaan file (bukan isi): ls, find (tanpa -exec/-delete/-fprint), test/[, stat. */
const NAME_BINS = /^(ls|find|test|\[|stat|basename|dirname)$/;
function nameOnly(cmd) {
  if (/[`<>]|\$\(|\bxargs\b/.test(cmd)) return false;
  for (const seg of segments(cmd)) {
    if (!isSecretPath(seg)) continue;
    const w = words(seg); const bin = path.basename(w[0] || "");
    if (!NAME_BINS.test(bin)) return false;
    if (bin === "find" && w.some((a) => /^-(exec|execdir|ok|okdir|delete|fprint\w*|fls)$/.test(a))) return false;
  }
  return true;
}

const PROTECTED = /^(?:refs\/heads\/)?(main|master)$/;

/** Ambil path kunci dari -i <path> / -o IdentityFile=<path> / -oIdentityFile=<path>. */
function sshKeyArg(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-i" && args[i + 1]) return args[i + 1];
    if (args[i] === "-o" && args[i + 1]) { const m = args[i + 1].match(/^IdentityFile=(.+)$/); if (m) return m[1]; }
    const m2 = args[i].match(/^-oIdentityFile=(.+)$/); if (m2) return m2[1];
  }
  return "";
}
/** Kunci deploy: di bawah ~/.lumitome (LUMI_HOME) atau workspace, dan bukan path rahasia. */
function isDeployKeyPath(key, ws, home, lumiHome) {
  let s = String(key || "");
  if (s === "~") s = home; else if (s.startsWith("~/")) s = path.join(home, s.slice(2));
  const abs = path.resolve(ws, s);
  if (isSecretPath(abs) || isHomeSecret(abs)) return false;
  return within(lumiHome, abs) || within(ws, abs);
}

/** Pakai kunci SSH pribadi (~/.ssh) HANYA sebagai argumen -i/IdentityFile perintah
 *  ssh/scp/sftp/rsync — dan HANYA di tier trusted (izin eksplisit user via
 *  `lumitome trust trusted`). Isi kunci tidak pernah dibaca/disalin/dicetak:
 *  yang diizinkan hanya meneruskan path kunci ke biner ssh. Bentuk yang lolos
 *  hanya `-i <path>` dan `-o IdentityFile=<path>` (spasi); bentuk -e rsync dan
 *  -i menempel tetap ditolak (fail-closed). Segala sentuhan secret-path lain
 *  di perintah yang sama — mis. perintah remote yang menyentuh ~/.ssh/.env —
 *  tetap ditolak aturan secret (hanya SATU kemunculan nilai kunci yang dihapus
 *  dari pemeriksaan; kemunculan berikutnya tetap ketangkap). */
function sshKeyUseOnly(cmd, { workspace, home }) {
  for (const seg of segments(cmd)) {
    const w = words(seg);
    let i = 0; while (i < w.length && /^(sudo|command|exec|nohup|time|env|xargs|builtin)$|^[A-Za-z_]+=/.test(w[i])) i++;
    const bin = path.basename(w[i] || "");
    if (!(bin === "ssh" || bin === "scp" || bin === "sftp" || bin === "rsync")) return false;
    const key = sshKeyArg(w.slice(i + 1));
    if (!key) return false;
    let s = String(key);
    if (s === "~") s = home; else if (s.startsWith("~/")) s = path.join(home, s.slice(2));
    const abs = path.resolve(workspace, s);
    if (!within(path.join(home, ".ssh"), abs)) return false;
    const rest = [...w];
    const kpos = rest.findIndex((t, j) => j > i && (t === key || t === `IdentityFile=${key}` || t === `-oIdentityFile=${key}`));
    if (kpos < 0) return false;
    rest.splice(kpos, 1);
    if (isSecretPath(rest.join(" "))) return false;
  }
  return true;
}

/** Keputusan untuk satu perintah shell. effect: allow | ask | deny. */
export function classifyShell(command, { workspace = process.cwd(), headless = false, branch, tier = "standard", home = os.homedir(), lumiHome = path.join(os.homedir(), ".lumitome") } = {}) {
  const cmd = String(command ?? "");
  const ws = path.resolve(workspace);
  if (!cmd.trim()) return { effect: "allow" };
  // 1) rahasia (berlaku untuk semua verb: cat/less/grep/source/cp/…)
  // Pengecualian sempit: di tier trusted, pakai kunci ~/.ssh sebagai -i/IdentityFile
  // ssh/scp/sftp/rsync diizinkan (isi kunci tidak pernah dibaca — hanya diteruskan
  // ke biner ssh). Segala akses secret lain tetap ditolak di semua tier.
  if (isSecretPath(cmd) && !nameOnly(cmd) && !(tier === "trusted" && sshKeyUseOnly(cmd, { workspace: ws, home }))) return { effect: "deny", rule: "secret", reason: "LUMI_DENY secret: perintah menyentuh isi .env/secret (hanya .env.example; daftar nama via ls/find/test diizinkan)" };
  if (KEY_VAR.test(cmd)) return { effect: "deny", rule: "secret-var", reason: "LUMI_DENY secret: perintah mereferensikan variabel API key/token" };
  if (/\beval\b/.test(cmd) && /\bgit\b|\brm\b|\.env/.test(cmd)) return { effect: "deny", rule: "eval", reason: "LUMI_DENY eval: perintah dinamis berisiko tidak bisa diverifikasi" };
  let ask = null;
  for (const seg of segments(cmd)) {
    const w = words(seg);
    let i = 0; while (i < w.length && /^(sudo|command|exec|nohup|time|env|xargs|builtin)$|^[A-Za-z_]+=/.test(w[i])) { if (w[i] === "sudo") return { effect: "deny", rule: "sudo", reason: "LUMI_DENY sudo" }; i++; }
    if (i >= w.length && w.some((x) => x === "env")) return { effect: "deny", rule: "env-dump", reason: "LUMI_DENY env-dump: menampilkan environment (berisi key) dilarang" };
    const bin = path.basename(w[i] || "");
    const args = w.slice(i + 1);
    // 2b) SSH: kunci deploy khusus, atau tier trusted. Di tier trusted, kunci utama
    // user (~/.ssh) BOLEH dipakai sebagai -i/IdentityFile (pengecualian sempit di
    // aturan secret di atas — isi kunci tidak pernah dibaca; hanya diteruskan ke
    // biner ssh). Tanpa tier trusted, kunci utama tetap ditolak.
    // (Kunci pola rahasia — id_*, ~/.ssh/ — sudah ditolak aturan secret di atas
    // kecuali pengecualian itu; di sini yang dicek hanya lokasinya.)
    if (bin === "ssh" || bin === "scp" || bin === "sftp" || (bin === "rsync" && args.some((a) => /^[^/\s]+:/.test(a) && !/^[A-Za-z]:[\\/]/.test(a)))) {
      if (tier !== "trusted") {
        if (args.includes("-A") || args.some((a, j) => a === "-o" && /ForwardAgent\s*=\s*yes/i.test(args[j + 1] || "")) || args.some((a) => /^-oForwardAgent\s*=\s*yes/i.test(a)))
          return { effect: "deny", rule: "ssh-agent-forward", reason: "LUMI_DENY ssh: ForwardAgent hanya di tier trusted" };
        const key = sshKeyArg(args);
        if (!key || !isDeployKeyPath(key, ws, home, lumiHome))
          return { effect: "deny", rule: "ssh-key", reason: "LUMI_DENY ssh: pakai -i kunci deploy (~/.lumitome/<nama>, bukan id_*) atau naikkan tier: lumitome trust trusted" };
      }
    }
    if (ENV_DUMP.test(" " + seg) && /^(printenv|env|set|declare|export)$/.test(bin) && args.every((a) => a.startsWith("-") || a === "")) return { effect: "deny", rule: "env-dump", reason: "LUMI_DENY env-dump: menampilkan environment (berisi key) dilarang" };
    // 2) rm rekursif/force di luar workspace
    if (bin === "rm" || bin === "rmdir" || (bin === "find" && args.includes("-delete"))) {
      const flags = args.filter((a) => a.startsWith("-")).join("");
      const targets = bin === "find" ? [args[0] || "."] : args.filter((a) => !a.startsWith("-"));
      const recursive = /r|R|-recursive|f/.test(flags) || bin === "find";
      for (const t of targets) {
        if (/[$`*]/.test(t) && /^[\/~$]/.test(t)) return { effect: "deny", rule: "rm-outside", reason: `LUMI_DENY rm: target dinamis/glob absolut '${t}'` };
        const abs = resolveIn(ws, t);
        if (!inside(ws, abs) && recursive) return { effect: "deny", rule: "rm-outside", reason: `LUMI_DENY rm: '${t}' di luar workspace (${ws}) atau root workspace` };
        if (!inside(ws, abs)) return { effect: "deny", rule: "rm-outside", reason: `LUMI_DENY rm: '${t}' di luar workspace` };
      }
    }
    // 3) git push
    const gi = bin === "git" ? args.findIndex((a) => a === "push") : -1;
    if (gi >= 0 && args.slice(0, gi).every((a) => a.startsWith("-") || /^-C$|^-c$/.test(a) || args[args.indexOf(a) - 1] === "-C" || args[args.indexOf(a) - 1] === "-c")) {
      const pa = args.slice(gi + 1);
      if (pa.some((a) => /^(-f|--force|--force-with-lease(=.*)?|--force-if-includes|--mirror|--delete|-d|--prune)$/.test(a) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)))
        return { effect: "deny", rule: "push-force", reason: "LUMI_DENY push: --force/-f/--force-with-lease/--mirror/--delete dilarang" };
      const pos = pa.filter((a) => !a.startsWith("-"));
      if (pos.some((a) => a.startsWith("+"))) return { effect: "deny", rule: "push-force", reason: "LUMI_DENY push: refspec '+' (force) dilarang" };
      if (pa.includes("--all") || pa.includes("--tags") && pos.length === 0) { /* --all bisa menyentuh main */ return { effect: "deny", rule: "push-main", reason: "LUMI_DENY push: --all dapat menyentuh main/master" }; }
      const refs = pos.slice(1);
      const cur = branch ?? currentBranch(ws);
      const targets = refs.length ? refs.map((r) => (r.includes(":") ? r.split(":").pop() : r)) : [cur || "HEAD"];
      const resolved = targets.map((t) => (t === "HEAD" ? cur : t));
      if (resolved.some((t) => !t || PROTECTED.test(t))) return { effect: "deny", rule: "push-main", reason: `LUMI_DENY push: target main/master (atau tak dikenal) dilarang — kerja di branch lain` };
      ask = { effect: headless ? "deny" : "ask", rule: "push-branch", reason: headless ? "LUMI_DENY push: push branch butuh persetujuan manusia; mode headless menolak (jalankan interaktif)" : "LUMI_ASK push branch" };
    }
  }
  return ask || { effect: "allow" };
}


// ---------- kebijakan sandbox (v0.3.19, gaya Codex workspace-write + tier kepercayaan) ----------
// Baca: seluruh $HOME (+ path sistem), read-only. Tulis: hanya cwd (+ temp/cache), kecuali tier trusted
// (tulis selebar akar proyek) dan file extraWrite. Rahasia di $HOME disamarkan.
const WIN = process.platform === "win32";
const norm = (p) => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
const within = (base, p) => { const r = path.relative(norm(base), norm(p)); return r === "" || !r.startsWith("..") && !path.isAbsolute(r); };
export const SYSTEM_READ = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32", "/opt", "/etc", "/tmp", "/dev/null", "/proc/self"];
/** Path rahasia relatif $HOME: folder/file kunci, kredensial cloud, keyring, profil & cookie browser. */
export const HOME_SECRETS = [
  ".ssh", ".gnupg", ".aws", ".azure", ".config/gcloud", ".kube", ".docker/config.json", ".password-store", ".local/share/keyrings", ".pki",
  ".netrc", ".git-credentials", ".npmrc", ".pypirc", ".cargo/credentials", ".cargo/credentials.toml", ".config/gh/hosts.yml", ".lumitome/credentials.json", ".lumitome/secrets.env",
  ".mozilla", ".thunderbird", ".config/google-chrome", ".config/chromium", ".config/BraveSoftware", ".config/microsoft-edge", ".config/vivaldi", ".config/opera", "snap/firefox", "snap/chromium",
  "AppData/Roaming/Mozilla", "AppData/Local/Google/Chrome/User Data", "AppData/Local/Microsoft/Edge/User Data", "AppData/Local/BraveSoftware", "AppData/Roaming/gnupg", "AppData/Roaming/Microsoft/Credentials", "AppData/Local/Microsoft/Credentials",
];
const HOME_SECRET_RE = new RegExp("(?:^|[\\\\/\\s'\"`=~])(?:" + [
  "\\.ssh", "\\.gnupg", "\\.aws", "\\.azure", "\\.config[\\\\/]gcloud", "\\.kube", "\\.docker[\\\\/]config\\.json", "\\.password-store", "share[\\\\/]keyrings", "\\.pki",
  "\\.cargo[\\\\/]credentials(?:\\.toml)?", "\\.config[\\\\/]gh[\\\\/]hosts\\.yml", "\\.lumitome[\\\\/]credentials\\.json", "\\.mozilla", "\\.thunderbird",
  "\\.config[\\\\/](?:google-chrome|chromium|BraveSoftware|microsoft-edge|vivaldi|opera)", "snap[\\\\/](?:firefox|chromium)", "AppData[\\\\/]Roaming[\\\\/](?:Mozilla|gnupg)", "BraveSoftware", "Chrome[\\\\/]User Data", "Edge[\\\\/]User Data", "Microsoft[\\\\/]Credentials",
].join("|") + ")(?=$|[\\\\/\\s'\"`;|&)<>,])", "i");
export function isHomeSecret(s) { return HOME_SECRET_RE.test(" " + String(s || "") + " "); }

/** Daftar path sandbox untuk satu workspace. writeRoots: ganti [cwd] sebagai akar tulis (tier trusted). */
export function sandboxPaths(workspace, { home = os.homedir(), extraRead = [], extraWrite = [], extraMasked = [], writeRoots = null } = {}) {
  const cwd = path.resolve(workspace); const h = path.resolve(home);
  if (h === path.parse(h).root) throw new Error(`$HOME tidak valid ('${h}')`);
  const write = [...(writeRoots ? writeRoots.map((p) => path.resolve(p)) : [cwd]), ...extraWrite.map((p) => path.resolve(p))];
  const read = [h, ...(WIN ? [] : SYSTEM_READ), ...extraRead.map((p) => path.resolve(p))];
  const masked = [...HOME_SECRETS.map((r) => path.join(h, r)), ...extraMasked.map((p) => path.resolve(p))];
  return { cwd, home: h, read, write, masked };
}
export function isMasked(abs, sp) { return sp.masked.some((m) => within(m, abs)) || isSecretPath(abs) || isHomeSecret(abs); }
/** Status path: "masked" | "write" | "read" | "outside". */
export function pathAccess(abs, sp) {
  const p = path.resolve(abs);
  if (isMasked(p, sp)) return "masked";
  if (sp.write.some((w) => within(w, p))) return "write";
  if (sp.read.some((r) => within(r, p))) return "read";
  return "outside";
}
export function outsideMessage(p, sp, kind) {
  return kind === "write"
    ? `LUMI_SANDBOX_OUTSIDE: tulis ke '${p}' ditolak. Hanya folder kerja yang bisa ditulis: ${sp.write[0]}. Jalankan lumitome dari folder tujuan, atau buka akses lewat: lumitome trust trusted`
    : `LUMI_SANDBOX_OUTSIDE: '${p}' di luar area baca (${sp.home} dan path sistem).`;
}

/** Marker akar proyek (v0.3.19). Bukan config — hanya penanda path untuk deteksi root. */
export const PROJECT_ROOT_MARKERS = [".git", "opencode.jsonc", "MEMORY.md", ".lumitome"];
/** Akar proyek: jalan ke atas dari start sampai maks 5 tingkat; berhenti di $HOME (marker di $HOME sendiri diabaikan). */
export function detectProjectRoot(start, { home = os.homedir(), maxDepth = 5 } = {}) {
  const h = path.resolve(home);
  let d; try { d = fs.realpathSync(start); } catch { d = path.resolve(start); }
  for (let i = 0; i <= maxDepth; i++) {
    if (d !== h && PROJECT_ROOT_MARKERS.some((m) => { try { return fs.existsSync(path.join(d, m)); } catch { return false; } })) return d;
    if (d === h) break;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return path.resolve(start);
}
/** File MEMORY.md di ancestor (start ke atas, maks 5 tingkat, tanpa $HOME) — untuk extraWrite file saja. */
export function findAncestorMemoryFiles(start, { home = os.homedir(), maxDepth = 5 } = {}) {
  const h = path.resolve(home);
  const out = [];
  let d; try { d = fs.realpathSync(start); } catch { d = path.resolve(start); }
  for (let i = 0; i <= maxDepth; i++) {
    if (d !== h) { const f = path.join(d, "MEMORY.md"); try { if (fs.existsSync(f) && fs.statSync(f).isFile()) out.push(f); } catch {} }
    if (d === h) break;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return out;
}

/** Tingkat kepercayaan sandbox (v0.3.19): strict = workspace-write + bwrap; standard = sama tanpa bwrap;
 * trusted = tulis selebar akar proyek, tanpa bwrap. Default: standard. */
export const TRUST_TIERS = ["strict", "standard", "trusted"];
/** File trust milik user — WAJIB di luar workspace (LUMI_HOME), supaya agent tidak bisa mengubah tier-nya sendiri. */
export function trustFilePath(lumiHome) { return path.join(lumiHome, "trust.json"); }
/** Baca file trust. Rusak/hilang → {}. Tidak pernah throw. */
export function readTrustFile(lumiHome) {
  try {
    const raw = JSON.parse(fs.readFileSync(trustFilePath(lumiHome), "utf8"));
    if (raw && typeof raw === "object" && raw.projects && typeof raw.projects === "object") return raw;
  } catch {}
  return { projects: {} };
}
/** Normalisasi satu entri proyek: string tier, atau { tier, write: [...] }. */
export function normalizeTrustEntry(entry) {
  if (typeof entry === "string") return { tier: entry, write: [] };
  if (entry && typeof entry === "object") return { tier: entry.tier, write: Array.isArray(entry.write) ? entry.write : [] };
  return { tier: undefined, write: [] };
}
/** Tier efektif + sumbernya: env LUMI_TRUST_TIER menang, lalu file trust (kunci = akar proyek), lalu default standard. */
export function resolveTrustTierDetailed(workspace, { home = os.homedir(), lumiHome = path.join(home, ".lumitome"), env = process.env } = {}) {
  const fromEnv = String(env.LUMI_TRUST_TIER || "").trim();
  if (TRUST_TIERS.includes(fromEnv)) return { tier: fromEnv, source: "env" };
  const root = detectProjectRoot(workspace, { home });
  const entry = normalizeTrustEntry(readTrustFile(lumiHome).projects[root]);
  if (TRUST_TIERS.includes(entry.tier)) return { tier: entry.tier, source: "file" };
  return { tier: "standard", source: "default" };
}
/** Tier efektif (kompatibel lama): hanya tier, tanpa sumber. */
export function resolveTrustTier(workspace, opts = {}) {
  return resolveTrustTierDetailed(workspace, opts).tier;
}
/** Entri tulis eksplisit dari trust file untuk proyek ini (relatif ke root, absolut, atau ~). */
export function resolveTrustWrite(workspace, { home = os.homedir(), lumiHome = path.join(home, ".lumitome") } = {}) {
  const root = detectProjectRoot(workspace, { home });
  return normalizeTrustEntry(readTrustFile(lumiHome).projects[root]).write;
}
function resolveTrustWritePath(p, root, home) {
  let s = String(p || "").trim();
  if (!s) return null;
  if (s === "~") s = home; else if (s.startsWith("~/")) s = path.join(home, s.slice(2));
  const abs = path.resolve(root, s);
  if (!within(home, abs)) return null; // wajib di dalam $HOME
  if (isSecretPath(abs) || isHomeSecret(abs)) return null; // bukan rahasia
  return abs;
}
/** Satu titik rakit kebijakan sandbox per sesi: tier + root + file memori + trust file ter-mask. */
export function buildSandboxScope(workspace, { home = os.homedir(), lumiHome = path.join(home, ".lumitome"), env = process.env } = {}) {
  const ws = path.resolve(workspace);
  const root = detectProjectRoot(ws, { home });
  const { tier, source: tierSource } = resolveTrustTierDetailed(ws, { home, lumiHome, env });
  const trustFile = trustFilePath(lumiHome);
  const memoryFiles = findAncestorMemoryFiles(ws, { home });
  const explicit = resolveTrustWrite(ws, { home, lumiHome }).map((p) => resolveTrustWritePath(p, root, home)).filter(Boolean);
  const writeRoots = tier === "trusted" ? [root] : [ws];
  const covered = (f) => writeRoots.some((w) => within(w, f));
  const extraWrite = [...new Set([...explicit, ...memoryFiles].filter((f) => !covered(f)))];
  const sp = sandboxPaths(ws, { home, extraWrite, extraMasked: [trustFile], writeRoots: tier === "trusted" ? [root] : null });
  return { sp, tier, tierSource, root, workspace: ws, memoryFiles, trustFile, write: sp.write };
}

/**
 * Validasi LUMI_HARNESS (v0.3.43, P1-2): hanya path di bawah ~/.lumitome/
 * (atau modul guard bawaan = fallback) yang diizinkan; di luar itu → tolak.
 * Symlink diperiksa lewat realpath: link di dalam ~/.lumitome/ yang menunjuk
 * ke luar tetap ditolak. `fallback` boleh satu path atau daftar path.
 * Kembali: { ok, path?, source?, reason? } — tidak pernah throw.
 * Catatan: wrapper Lumitome selalu menyetel LUMI_HARNESS ke modul guard bawaan
 * repo (build-config.mjs), jadi jalur normal lolos sebagai "fallback"; yang
 * ditolak adalah pengalihan ke modul sembarang (mis. saat engine dijalankan
 * langsung dengan env buatan). Plugin menduplikasi cek ini sebaris (bootstrap:
 * validator ini tinggal di modul yang sedang divalidasi).
 */
export function resolveHarnessPath(raw, { home = os.homedir(), lumiHome = path.join(home, ".lumitome"), fallback = null } = {}) {
  const fallbacks = [fallback].flat().filter(Boolean).map((f) => path.resolve(f));
  const realOf = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
  const fbReal = fallbacks.map(realOf);
  const s = String(raw || "").trim();
  if (!s) return { ok: true, path: fallbacks[0] || null, source: "fallback" };
  let p = s === "~" ? home : (s.startsWith("~/") || s.startsWith("~\\")) ? path.join(home, s.slice(2)) : s;
  p = path.resolve(p);
  const rp = realOf(p);
  const allowed = (x) => within(lumiHome, x) || fallbacks.includes(x) || fbReal.includes(x);
  if (allowed(p) && allowed(rp)) return { ok: true, path: p, source: within(lumiHome, p) ? "lumitome-home" : "fallback" };
  return { ok: false, path: p, reason: `LUMI_HARNESS '${s}' ditolak: hanya path di bawah ${lumiHome}/ (atau modul guard bawaan Lumitome) yang diizinkan` };
}

function expandPath(p, base, home) {
  let s = String(p).replace(/^['"]|['"]$/g, "");
  if (s === "~") s = home; else if (s.startsWith("~/") || s.startsWith("~\\")) s = path.join(home, s.slice(2));
  return path.resolve(base, s);
}
const WRITE_BINS = /^(tee|touch|mkdir|cp|mv|ln|install|truncate|rsync)$/;
/** Target tulis yang terlihat di perintah shell (redirect, tee/touch/mkdir/truncate, tujuan cp/mv/ln/install/rsync). */
export function shellWriteTargets(seg) {
  const out = [];
  for (const m of String(seg).matchAll(/(?:^|[^<>\d&])(?:\d|&)?>>?\|?\s*("[^"]*"|'[^']*'|[^\s;|&<>]+)/g)) out.push(m[1]);
  const w = words(seg); let i = 0;
  while (i < w.length && /^(command|exec|nohup|time|env|builtin)$|^[A-Za-z_]+=/.test(w[i])) i++;
  const bin = path.basename(w[i] || ""); const pos = w.slice(i + 1).filter((a) => !a.startsWith("-") && !/^\d?>/.test(a));
  if (/^(tee|touch|mkdir|truncate)$/.test(bin)) out.push(...pos);
  else if (WRITE_BINS.test(bin) && pos.length >= 2) out.push(pos.at(-1));
  return out;
}
/** Pelanggaran kebijakan di perintah shell: [{ path, kind: "write" | "read" }]. */
export function shellOutsidePaths(command, sp, { home = sp.home || os.homedir() } = {}) {
  const out = [];
  for (const seg of segments(command)) {
    for (const t of shellWriteTargets(seg)) {
      if (!t || /[*?$`]/.test(t) || /^\/dev\/(null|stdout|stderr|tty|fd\/)/.test(t)) continue;
      const abs = expandPath(t, sp.cwd, home);
      if (within("/tmp", abs) && !WIN) continue;
      if (pathAccess(abs, sp) !== "write") out.push({ path: t, kind: "write" });
    }
    for (const w of words(seg)) for (const t of String(w).split(/[=,:]/)) {
      if (!/^(~|\.\.)/.test(t) || /[*?$`]/.test(t)) continue;
      if (pathAccess(expandPath(t, sp.cwd, home), sp) === "outside") out.push({ path: t, kind: "read" });
    }
  }
  const seen = new Set(); return out.filter((x) => !seen.has(x.kind + x.path) && seen.add(x.kind + x.path));
}

/** Keputusan untuk tool file (read/edit/write/glob/grep/list/patch). */
export function classifyFileTool(tool, input, { workspace = process.cwd(), sandbox = null, extraRead = [] } = {}) {
  const vals = [];
  for (const k of ["path", "filePath", "file", "pattern", "include", "glob", "directory"]) if (input && typeof input[k] === "string") vals.push(input[k]);
  if (input && Array.isArray(input.paths)) vals.push(...input.paths.map(String));
  // glob/list hanya mengembalikan nama file → boleh; read/grep/edit/write/patch tetap ditolak
  if (/^(glob|list|ls)$/.test(tool)) return { effect: "allow" };
  for (const v of vals) if (isSecretPath(v) || isSecretPath(path.basename(v))) return { effect: "deny", rule: "secret", reason: `LUMI_DENY secret: ${tool} ke '${v}' dilarang` };
  // v0.3.16: kebijakan yang sama dengan bwrap (juga Windows, tanpa bwrap)
  if (sandbox) {
    const pv = [];
    for (const k of ["path", "filePath", "file", "directory"]) if (input && typeof input[k] === "string" && input[k]) pv.push(input[k]);
    if (input && Array.isArray(input.paths)) pv.push(...input.paths.map(String));
    if (typeof input?.patchText === "string") for (const m of input.patchText.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) pv.push(m[1].trim());
    if (typeof input?.patchText === "string") for (const m of input.patchText.matchAll(/^\*\*\* Move to: (.+)$/gm)) pv.push(m[1].trim());
    const isWrite = /^(edit|write|patch|multiedit|apply_patch)$/.test(tool);
    const extra = (extraRead || []).map((d) => path.resolve(d));
    for (const v of pv) {
      const abs = expandPath(v, sandbox.cwd, sandbox.home || os.homedir());
      const acc = pathAccess(abs, sandbox);
      if (acc === "masked") return { effect: "deny", rule: "secret", reason: `LUMI_DENY secret: ${tool} ke '${v}' dilarang (folder rahasia)` };
      if (isWrite && acc !== "write") return { effect: "deny", rule: "sandbox-write", reason: outsideMessage(v, sandbox, "write") };
      if (!isWrite && acc === "outside" && !extra.some((d) => within(d, abs))) return { effect: "deny", rule: "sandbox-read", reason: outsideMessage(v, sandbox, "read") };
    }
  }
  return { effect: "allow" };
}

// ---------- urutan penegakan (v0.3.23) ----------
// Nama tool yang dijaga. Cerminan di lumitome/config/plugins/lumitome-guard.ts — plugin harus
// memfilter hook bahkan saat modul guard gagal dimuat, jadi daftar ini ada di dua tempat.
export const SHELL_TOOLS = new Set(["shell", "bash"]);
export const FILE_TOOLS = new Set(["read", "edit", "write", "glob", "grep", "list", "patch", "multiedit", "apply_patch"]);
/** Tool yang dijaga guard (SHELL + FILE). Di luar itu: allow + unguarded (P1-2). */
export const GUARDED_TOOLS = new Set([...SHELL_TOOLS, ...FILE_TOOLS]);
export function isGuardedTool(tool) { return GUARDED_TOOLS.has(String(tool)); }

/**
 * Satu titik penegakan untuk hook tool.execute.before: urutan kebijakan tinggal di guard,
 * plugin hanya wiring (panggil ini, lempar bila deny, terapkan rewrite, jurnal).
 * Urutan (sama persis dengan yang dulu tinggal di plugin): fail-closed → anti-spin →
 * file: classifyFileTool → shell: classifyShell → shellOutsidePaths → bwrap rewrite.
 * Kembali: { effect: "allow" | "ask" | "deny", rule?, reason?, rewrite? }.
 * - deny: plugin melempar reason (jurnal: kind "spin" bila rule spin, selain itu "deny").
 * - allow/ask: lanjut; rewrite.command (bila ada) menggantikan input.command (mode bwrap).
 * - "ask" (mis. push branch non-headless) diteruskan apa adanya — lapisan izin OpenCode yang menangani.
 */
export function evaluateTool(tool, input, ctx = {}) {
  const t = String(tool);
  // P1-2: tool di luar daftar (MCP, webfetch/websearch, sub-agent/task, skill, …)
  // TIDAK diblokir — daftar tool OpenCode tidak lengkap & plugin baru akan patah —
  // tapi ditandai unguarded supaya plugin mencatatnya di jurnal. Langkah berikut:
  // perluasan guard ke tool ini (lihat CHANGELOG 0.3.43).
  if (!isGuardedTool(t)) return { effect: "allow", unguarded: true };
  const { workspace = process.cwd(), sandbox = null, tier = "standard", headless = false, toolDirs = [], argsDir, sandboxMode = "off", spin = null, closed = "", lumiHome = "" } = ctx;
  // 1) fail-closed: guard/sandbox gagal dibangun → tulis ditolak, baca tetap jalan
  if (closed && (SHELL_TOOLS.has(t) || (t !== "read" && t !== "glob" && t !== "grep" && t !== "list"))) {
    return { effect: "deny", rule: "closed", reason: closed };
  }
  // 2) anti-spin (per-signature; instance dibuat sekali di setup plugin, dilewat ctx)
  if (spin) {
    const s = spin.before(t, SHELL_TOOLS.has(t) ? { command: String(input?.command ?? "") } : input);
    if (s.effect === "deny") return { effect: "deny", rule: "spin", reason: s.reason };
  }
  // 3) tool file: satu klasifikasi, lalu selesai
  if (FILE_TOOLS.has(t)) {
    const d = classifyFileTool(t, input || {}, { workspace, sandbox, extraRead: [...toolDirs, lumiHome].filter(Boolean) });
    if (d.effect === "deny") return { effect: "deny", rule: d.rule, reason: d.reason };
    return { effect: "allow" };
  }
  // 4) shell: klasifikasi perintah
  const command = String(input?.command ?? "");
  const d = classifyShell(command, { workspace, headless, tier });
  if (d.effect === "deny") return { effect: "deny", rule: d.rule, reason: d.reason, command };
  // 5) shell: path di luar kebijakan sandbox
  const outside = shellOutsidePaths(command, sandbox);
  if (outside.length) return { effect: "deny", rule: "sandbox-outside", reason: outsideMessage(outside[0].path, sandbox, outside[0].kind), command };
  // 6) bwrap: bungkus perintah (rewrite), bukan tolak
  if (sandboxMode === "bwrap") {
    return { effect: d.effect, rewrite: { command: bwrapCommand(command, { workspace, toolDirs, argsDir, sandbox }) } };
  }
  return { effect: d.effect };
}

// ---------- bwrap ----------
export function bwrapAvailable() {
  try { execFileSync("bwrap", ["--ro-bind", "/", "/", "--unshare-pid", "--proc", "/proc", "--dev", "/dev", "true"], { stdio: "ignore", timeout: 5000 }); return true; }
  catch { return false; }
}
const SECRET_FILE = (n) => /^\.env(\..+)?$/.test(n) && !/^\.env\.(example|sample|template)$/.test(n) || /^(secrets\.env|\.netrc|\.git-credentials|\.npmrc|\.pypirc|id_(rsa|dsa|ed25519|ecdsa))$/.test(n);
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", ".next", "target", ".cache", ".npm", ".rustup", ".cargo", ".local", "snap", ".vscode-server", ".lumitome", "__pycache__", ".gradle", ".m2"]);
// ---------- cache pemindaian rahasia (v0.3.19) ----------
// findSecrets jalan kaki di $HOME + workspace; tanpa cache, tiap perintah shell membayar ~866 ms
// (diukur, 5 sampel). Isi pohon nyaris tidak berubah dalam satu sesi → cache 5 menit per proses.
const _secretScanCache = new Map();
const SECRET_SCAN_TTL_MS = 5 * 60 * 1000;
export function clearSecretScanCache() { _secretScanCache.clear(); }
function cachedFindSecrets(d, opts = {}) {
  const depth = opts.depth ?? 5, limit = opts.limit ?? 20000;
  const key = `${d}|${depth}|${limit}`;
  const hit = _secretScanCache.get(key);
  if (hit && Date.now() - hit.at < SECRET_SCAN_TTL_MS) return hit.out;
  const out = findSecrets(d, { depth, limit });
  _secretScanCache.set(key, { at: Date.now(), out });
  return out;
}
/** Cari file rahasia (.env, secrets.env, id_*) di bawah d. Dibatasi kedalaman & jumlah entri. */
function findSecrets(d0, { depth = 5, limit = 20000 } = {}) {
  const out = []; let seen = 0;
  const walk = (d, n) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (++seen > limit) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !isHomeSecret(p) && n < depth) walk(p, n + 1); }
      else if (SECRET_FILE(e.name)) out.push(p);
    }
  };
  walk(d0, 0); return out;
}
const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
/**
 * Bungkus perintah: $HOME read-only, cwd read-write, /tmp tmpfs, rahasia di-mask, env dibersihkan.
 * Urutan bind penting: bind belakangan menimpa yang sebelumnya.
 */
export function bwrapArgs(command, { workspace, toolDirs = [], env = process.env, sandbox = null, home = os.homedir() } = {}) {
  const ws = path.resolve(workspace);
  const sp = sandbox || sandboxPaths(ws, { home });
  const h = sp.home;
  const a = ["--die-with-parent", "--new-session", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--clearenv"];
  for (const d of ["/usr", "/bin", "/lib", "/lib64", "/lib32", "/sbin", "/opt", "/etc"]) if (fs.existsSync(d)) a.push("--ro-bind", d, d);
  a.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/tmp/.cache");
  for (const d of toolDirs) if (d && fs.existsSync(d) && !within(ws, d) && !within(h, d)) a.push("--ro-bind", d, d);
  if (fs.existsSync(h)) a.push("--ro-bind", h, h);
  for (const d of toolDirs) if (d && fs.existsSync(d) && !within(ws, d) && within(h, d)) a.push("--ro-bind", d, d);
  for (const d of sp.write) if (fs.existsSync(d)) a.push("--bind", d, d);
  if (!sp.write.some((d) => path.resolve(d) === ws)) a.push("--bind", ws, ws);
  // mask: folder rahasia → tmpfs kosong read-only; file rahasia → /dev/null
  const masked = new Set();
  const maskFile = (f) => { if (!masked.has(f)) { masked.add(f); a.push("--ro-bind", "/dev/null", f); } };
  for (const m of sp.masked) {
    let st; try { st = fs.lstatSync(m); } catch { continue; }
    if (st.isSymbolicLink()) { try { st = fs.statSync(m); } catch { continue; } }
    if (st.isDirectory()) { if (!masked.has(m)) { masked.add(m); a.push("--tmpfs", m, "--remount-ro", m); } }
    else maskFile(m);
  }
  const roots = [ws, ...(fs.existsSync(h) && !within(ws, h) ? [h] : [])];
  for (const r of roots) for (const s of cachedFindSecrets(r, r === h ? { depth: 4 } : {})) if (!sp.masked.some((m) => within(m, s))) maskFile(s);
  for (const d of toolDirs) { const s = path.join(d, "secrets.env"); if (fs.existsSync(s)) maskFile(s); }
  const keep = { PATH: env.PATH || "/usr/bin:/bin", HOME: fs.existsSync(h) ? h : "/tmp", LANG: env.LANG || "C.UTF-8", TERM: env.TERM || "dumb", TZ: env.TZ || "", LUMI_SANDBOX: "bwrap",
    XDG_CACHE_HOME: "/tmp/.cache", PIP_CACHE_DIR: "/tmp/.cache/pip", npm_config_cache: "/tmp/.cache/npm", PYTHONDONTWRITEBYTECODE: "1",
    GIT_AUTHOR_NAME: env.GIT_AUTHOR_NAME || "", GIT_AUTHOR_EMAIL: env.GIT_AUTHOR_EMAIL || "", GIT_COMMITTER_NAME: env.GIT_COMMITTER_NAME || "", GIT_COMMITTER_EMAIL: env.GIT_COMMITTER_EMAIL || "", NODE_OPTIONS: "", CI: env.CI || "" };
  for (const [k, v] of Object.entries(keep)) if (v !== "") a.push("--setenv", k, v);
  a.push("--chdir", ws);
  const sh = fs.existsSync("/usr/bin/bash") ? "/usr/bin/bash" : "/bin/sh";
  a.push(sh, "-c", command);
  return a;
}
/**
 * String perintah untuk tool shell. Opsi bwrap (termasuk path rahasia yang di-mask) ditulis ke file
 * argumen NUL-separated (`bwrap --args 3`), sehingga string yang dilihat lapis permission OpenCode
 * hanya `bwrap --args 3 bash -c '<perintah asli>' 3<file` — pola deny `*…*` tetap cocok ke perintah asli.
 */
export function bwrapCommand(command, opts = {}) {
  const all = bwrapArgs(command, opts);
  const opt = all.slice(0, -3), tail = all.slice(-3);
  const dir = opts.argsDir || path.join(os.tmpdir(), "lumi-sbx");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = path.join(dir, `sbx-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.args`);
  fs.writeFileSync(f, opt.join("\0") + "\0", { mode: 0o600 });
  return `bwrap --args 3 ${tail.map(q).join(" ")} 3<${q(f)}`;
}
/** Ambil perintah asli dari string hasil bwrapCommand (untuk jurnal/anti-spin). */
export function unwrapCommand(s) {
  const m = String(s).match(/^bwrap --args 3 '[^']*' '-c' '((?:[^']|'\\'')*)' 3<'[^']*'$/);
  return m ? m[1].replace(/'\\''/g, "'") : String(s);
}

// ---------- anti-spin runtime ----------
const sig_ = (tool, input) => tool + ":" + JSON.stringify(input ?? {}).replace(/\s+/g, " ").slice(0, 500);
/**
 * Circuit breaker PER-SIGNATURE: setelah trip, hanya panggilan identik (tool+input sama) yang diblok;
 * tool/aksi lain tetap jalan (mis. agen boleh mengubah pendekatan lalu menjalankan tes).
 */
export class RuntimeSpin {
  constructor({ maxFail = 3, maxRepeat = 4 } = {}) { this.maxFail = maxFail; this.maxRepeat = maxRepeat; this.fail = new Map(); this.lastSig = ""; this.repeat = 0; this.blocked = new Map(); this.tripped = null; }
  before(tool, input) {
    const sig = sig_(tool, input);
    if (this.blocked.has(sig)) return { effect: "deny", reason: this.blocked.get(sig) };
    this.repeat = sig === this.lastSig ? this.repeat + 1 : 1; this.lastSig = sig;
    let r = null;
    if (this.repeat > this.maxRepeat) r = `ANTI_SPIN: panggilan identik ${tool} diulang ${this.repeat}x — aksi ini diblok; ganti pendekatan`;
    else if ((this.fail.get(sig) || 0) >= this.maxFail) r = `ANTI_SPIN: '${sig.slice(0, 120)}' sudah gagal ${this.maxFail}x — aksi ini diblok (maks ${this.maxFail} iterasi gagal); ganti pendekatan`;
    if (r) { this.blocked.set(sig, r); this.tripped = r; return { effect: "deny", reason: r }; }
    return { effect: "allow" };
  }
  after(tool, input, ok) {
    const sig = sig_(tool, input);
    if (ok) { this.fail.delete(sig); return; }
    this.fail.set(sig, (this.fail.get(sig) || 0) + 1);
  }
}

// ---------- done-gate runtime ----------
export const TEST_CMD = /\b(npm (run )?test|pnpm test|yarn test|bun test|node --test|npx (vitest|jest)|vitest|jest|pytest|go test|cargo test|make (test|check)|mvn test|gradle test|tsc( |$)|npm run (build|lint|typecheck))\b/;
/** Exit code tes disamarkan (`|| true`, `; true`, `set +e`, `|| :`, `; exit 0`) → bukan bukti lulus. */
export const MASKED_EXIT = /\|\|\s*(true|:|exit\s+0)\b|;\s*(true|:|exit\s+0)\s*(;|$|\bdone\b)|\bset\s+\+e\b/;
/** Ada perintah lain setelah perintah tes yang menentukan exit (`;`, `|`, `||`, newline, `&` latar) → exit bukan milik tes. `&&` aman. */
function afterTest(cmd) {
  const re = new RegExp(TEST_CMD.source, "g"); let m, end = -1;
  while ((m = re.exec(cmd))) end = m.index + m[0].length;
  if (end < 0) return false;
  const rest = cmd.slice(end).replace(/&&/g, "").replace(/2>&1|\d?>>?\s*[^\s;|&]+/g, "");
  return /[;|\n&]/.test(rest);
}
/** Output runner tes yang menandakan gagal (TAP/node:test, jest/vitest, pytest, go). */
export function testOutputFailed(text) {
  const t = String(text ?? "");
  return /^not ok \d+/m.test(t) || /^# fail [1-9]/m.test(t) || /\bTests?:\s+\d+ failed\b/.test(t) || /^=+ .*\b[1-9]\d* failed\b/m.test(t) || /^--- FAIL:/m.test(t) || /^FAIL\s/m.test(t);
}
/** Ringkas jurnal → input evaluateDoneGate. Bukti = perintah verifikasi terakhir + exit code efektif. */
/** Tool tulis file (baris jurnal kind:"tool" dari plugin guard; baca saja — read/glob/grep/list — bukan tulis). */
export const WRITE_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"]);
export function doneGateFromJournal(rows) {
  const tests = rows.filter((r) => r.kind === "shell" && TEST_CMD.test(r.command || "")).map((r) => {
    const masked = MASKED_EXIT.test(r.command || "") || afterTest(r.command || ""), outFail = !!r.failed_output;
    return masked || outFail ? { ...r, exit: r.exit || 1, raw_exit: r.exit, why: masked ? "exit code tes disamarkan/ditimpa perintah lain (|| true, ; cmd, | pipe, set +e)" : "output tes berisi kegagalan" } : r;
  });
  const last = tests[tests.length - 1];
  // spin hanya fatal bila TIDAK ada verifikasi lulus SETELAH trip terakhir
  const si = rows.map((r) => r.kind).lastIndexOf("spin");
  const okAfter = si >= 0 && rows.slice(si + 1).some((r) => r.kind === "shell" && TEST_CMD.test(r.command || "") && r.exit === 0);
  const spin = si >= 0 && !okAfter ? rows[si] : null;
  // P0-3: ada file diubah? Hanya tool tulis yang selesai (completed) yang tercatat di jurnal;
  // shell yang menulis file (sed/tee/redirect) tidak terlacak — keterbatasan ini dicatat di CHANGELOG.
  const wrote = rows.some((r) => r.kind === "tool" && WRITE_TOOLS.has(r.tool) && r.status === "completed");
  return { ran: tests.length, last, spin, facts: tests.map((t) => `FACT: \`${t.command}\` exit=${t.exit}`), wrote };
}
