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
  return ENV_FILE.test(s) || ENV_GLOB.test(s) || SECRET_PATHS.some((r) => r.test(s));
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

/** Keputusan untuk satu perintah shell. effect: allow | ask | deny. */
export function classifyShell(command, { workspace = process.cwd(), headless = false, branch } = {}) {
  const cmd = String(command ?? "");
  const ws = path.resolve(workspace);
  if (!cmd.trim()) return { effect: "allow" };
  // 1) rahasia (berlaku untuk semua verb: cat/less/grep/source/cp/…)
  if (isSecretPath(cmd) && !nameOnly(cmd)) return { effect: "deny", rule: "secret", reason: "LUMI_DENY secret: perintah menyentuh isi .env/secret (hanya .env.example; daftar nama via ls/find/test diizinkan)" };
  if (KEY_VAR.test(cmd)) return { effect: "deny", rule: "secret-var", reason: "LUMI_DENY secret: perintah mereferensikan variabel API key/token" };
  if (/\beval\b/.test(cmd) && /\bgit\b|\brm\b|\.env/.test(cmd)) return { effect: "deny", rule: "eval", reason: "LUMI_DENY eval: perintah dinamis berisiko tidak bisa diverifikasi" };
  let ask = null;
  for (const seg of segments(cmd)) {
    const w = words(seg);
    let i = 0; while (i < w.length && /^(sudo|command|exec|nohup|time|env|xargs|builtin)$|^[A-Za-z_]+=/.test(w[i])) { if (w[i] === "sudo") return { effect: "deny", rule: "sudo", reason: "LUMI_DENY sudo" }; i++; }
    if (i >= w.length && w.some((x) => x === "env")) return { effect: "deny", rule: "env-dump", reason: "LUMI_DENY env-dump: menampilkan environment (berisi key) dilarang" };
    const bin = path.basename(w[i] || "");
    const args = w.slice(i + 1);
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

/** Keputusan untuk tool file (read/edit/write/glob/grep/list/patch). */
export function classifyFileTool(tool, input, { workspace = process.cwd() } = {}) {
  const vals = [];
  for (const k of ["path", "filePath", "file", "pattern", "include", "glob", "directory"]) if (input && typeof input[k] === "string") vals.push(input[k]);
  if (input && Array.isArray(input.paths)) vals.push(...input.paths.map(String));
  // glob/list hanya mengembalikan nama file → boleh; read/grep/edit/write/patch tetap ditolak
  if (/^(glob|list|ls)$/.test(tool)) return { effect: "allow" };
  for (const v of vals) if (isSecretPath(v) || isSecretPath(path.basename(v))) return { effect: "deny", rule: "secret", reason: `LUMI_DENY secret: ${tool} ke '${v}' dilarang` };
  return { effect: "allow" };
}

// ---------- bwrap ----------
export function bwrapAvailable() {
  try { execFileSync("bwrap", ["--ro-bind", "/", "/", "--unshare-pid", "--proc", "/proc", "--dev", "/dev", "true"], { stdio: "ignore", timeout: 5000 }); return true; }
  catch { return false; }
}
function findSecrets(ws, depth = 5) {
  const out = []; const skip = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", ".next", "target"]);
  const walk = (d, n) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name) && n < depth) walk(p, n + 1); }
      else if (/^\.env(\..+)?$/.test(e.name) && !/^\.env\.(example|sample|template)$/.test(e.name) || /^(secrets\.env|\.netrc|\.git-credentials|\.npmrc|id_(rsa|ed25519|ecdsa))$/.test(e.name)) out.push(p);
    }
  };
  walk(ws, 0); return out;
}
const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
/** Bungkus perintah agar hanya workspace yang bisa ditulis; FS lain read-only/tidak terlihat; env dibersihkan; rahasia di-mask. */
export function bwrapArgs(command, { workspace, toolDirs = [], env = process.env } = {}) {
  const ws = path.resolve(workspace);
  const a = ["--die-with-parent", "--new-session", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--clearenv"];
  for (const d of ["/usr", "/bin", "/lib", "/lib64", "/lib32", "/sbin", "/opt", "/etc/alternatives", "/etc/ssl", "/etc/ca-certificates", "/etc/pki"]) if (fs.existsSync(d)) a.push("--ro-bind", d, d);
  for (const f of ["/etc/resolv.conf", "/etc/hosts", "/etc/passwd", "/etc/group", "/etc/nsswitch.conf", "/etc/localtime", "/etc/gitconfig"]) if (fs.existsSync(f)) a.push("--ro-bind", f, f);
  a.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/tmp/home");
  for (const d of toolDirs) if (d && fs.existsSync(d) && !inside(ws, d) && d !== ws) a.push("--ro-bind", d, d);
  a.push("--bind", ws, ws);
  for (const s of findSecrets(ws)) a.push("--ro-bind", "/dev/null", s);
  for (const d of toolDirs) { const s = path.join(d, "secrets.env"); if (fs.existsSync(s)) a.push("--ro-bind", "/dev/null", s); }
  const keep = { PATH: env.PATH || "/usr/bin:/bin", HOME: "/tmp/home", LANG: env.LANG || "C.UTF-8", TERM: env.TERM || "dumb", TZ: env.TZ || "", LUMI_SANDBOX: "bwrap",
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
const norm = (tool, input) => tool + ":" + JSON.stringify(input ?? {}).replace(/\s+/g, " ").slice(0, 500);
/**
 * Circuit breaker PER-SIGNATURE: setelah trip, hanya panggilan identik (tool+input sama) yang diblok;
 * tool/aksi lain tetap jalan (mis. agen boleh mengubah pendekatan lalu menjalankan tes).
 */
export class RuntimeSpin {
  constructor({ maxFail = 3, maxRepeat = 4 } = {}) { this.maxFail = maxFail; this.maxRepeat = maxRepeat; this.fail = new Map(); this.lastSig = ""; this.repeat = 0; this.blocked = new Map(); this.tripped = null; }
  before(tool, input) {
    const sig = norm(tool, input);
    if (this.blocked.has(sig)) return { effect: "deny", reason: this.blocked.get(sig) };
    this.repeat = sig === this.lastSig ? this.repeat + 1 : 1; this.lastSig = sig;
    let r = null;
    if (this.repeat > this.maxRepeat) r = `ANTI_SPIN: panggilan identik ${tool} diulang ${this.repeat}x — aksi ini diblok; ganti pendekatan`;
    else if ((this.fail.get(sig) || 0) >= this.maxFail) r = `ANTI_SPIN: '${sig.slice(0, 120)}' sudah gagal ${this.maxFail}x — aksi ini diblok (maks ${this.maxFail} iterasi gagal); ganti pendekatan`;
    if (r) { this.blocked.set(sig, r); this.tripped = r; return { effect: "deny", reason: r }; }
    return { effect: "allow" };
  }
  after(tool, input, ok) {
    const sig = norm(tool, input);
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
  return { ran: tests.length, last, spin, facts: tests.map((t) => `FACT: \`${t.command}\` exit=${t.exit}`) };
}
