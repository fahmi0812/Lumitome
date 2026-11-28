/**
 * SandboxProvider Abstraction (M5 / T4.1).
 *
 * Antarmuka tunggal dengan 5 kontrak kanonis (+ prepare opsional):
 *   - name: "noop" | "bwrap" | "remote"
 *   - isAvailable(): boolean
 *   - wrapCommand(cmd, opts): { command, env? }
 *   - exec(cmd, opts): Promise<{ exitCode, stdout, stderr }>
 *   - cleanup(): Promise<void>
 *
 * Patuh LINT-004b: lumi-guard.mjs tidak mengimpor file ini; sebaliknya
 * provider.mjs mengonsumsi helper murni dari ../lumi-guard.mjs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  bwrapAvailable,
  bwrapArgs,
  bwrapCommand,
  isHomeSecret,
  isSecretPath,
  sandboxPaths,
} from "../lumi-guard.mjs";
import { isBwrapAvailable as hasBwrapBinary } from "./bwrap-command.cjs";

export const SANDBOX_MODES = Object.freeze(["off", "bwrap", "remote"]);

const CREDENTIAL_MOUNT_PATTERNS = [
  /(?:^|[\\/])credentials\.json$/i,
  /(?:^|[\\/])\.ssh(?:[\\/]|$)/i,
  /(?:^|[\\/])secrets\.env$/i,
  /(?:^|[\\/])\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?$/i,
  /\bLUMI_KEY_9ROUTER\b/i,
  /\bNINEROUTER_API_KEY\b/i,
  /\bid_(?:rsa|dsa|ed25519|ecdsa)\b/i,
];

const FORBIDDEN_REMOTE_ENV_KEYS = new Set([
  "LUMI_KEY_9ROUTER",
  "LUMI_9ROUTER_KEY",
  "SW_9ROUTER_KEY", // env-compat-allow
  "NINEROUTER_API_KEY",
  "LUMI_SANDBOX_REMOTE_KEY",
]);

function isCredentialPathOrRef(raw, lumiHome = "") {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (isSecretPath(s) || isHomeSecret(s)) return true;
  if (CREDENTIAL_MOUNT_PATTERNS.some((re) => re.test(s))) return true;
  if (lumiHome) {
    const cred = path.resolve(lumiHome, "credentials.json");
    const resolved = path.resolve(s);
    if (resolved === cred) return true;
  }
  return false;
}

export function normalizeSandboxMode(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "off" || v === "noop") return "off";
  if (v === "bwrap") return "bwrap";
  if (v === "remote") return "remote";
  throw new Error(`SANDBOX_CLOSED: mode LUMI_SANDBOX '${raw}' tidak dikenal (valid: off | bwrap | remote)`);
}

function runLocalShell(command, { cwd = process.cwd(), env = process.env, timeoutMs = 60000 } = {}) {
  const sh = fs.existsSync("/usr/bin/bash") ? "/usr/bin/bash" : "/bin/sh";
  const res = spawnSync(sh, ["-c", String(command ?? "")], {
    cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  return {
    exitCode: typeof res.status === "number" ? res.status : 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message || res.error) : ""),
  };
}

export class NoopSandbox {
  constructor(opts = {}) {
    this.name = "noop";
    this.workspace = path.resolve(opts.workspace || opts.workspaceDir || process.cwd());
  }

  isAvailable() {
    return true;
  }

  async prepare(scope = {}) {
    return { mode: this.name, ok: true, scope };
  }

  wrapCommand(cmd, opts = {}) {
    return {
      command: String(cmd ?? ""),
      ...(opts?.env ? { env: { ...opts.env } } : {}),
    };
  }

  async exec(cmd, opts = {}) {
    const cwd = path.resolve(opts.workspaceDir || opts.cwd || this.workspace);
    return runLocalShell(cmd, { cwd, env: opts.env || process.env, timeoutMs: opts.timeoutMs ?? 60000 });
  }

  async cleanup() {
    // Noop: tidak ada artefak container/temp
  }
}

export class BwrapSandbox {
  #bwrapAvailableFn;
  #argsFiles;

  constructor(opts = {}) {
    this.name = "bwrap";
    this.workspace = path.resolve(opts.workspace || opts.workspaceDir || process.cwd());
    this.home = opts.home || os.homedir();
    this.env = opts.env || process.env;
    this.toolDirs = Array.isArray(opts.toolDirs) ? opts.toolDirs : [];
    this.argsDir = opts.argsDir || path.join(this.workspace, ".tmp", "sbx");
    this.sandbox = opts.sandbox || null;
    this.#bwrapAvailableFn = typeof opts.bwrapAvailable === "function"
      ? opts.bwrapAvailable
      : () => hasBwrapBinary() && bwrapAvailable();
    this.#argsFiles = new Set();
  }

  isAvailable() {
    try {
      return Boolean(this.#bwrapAvailableFn());
    } catch {
      return false;
    }
  }

  #assertAvailable() {
    if (!this.isAvailable()) {
      throw new Error("SANDBOX_CLOSED: LUMI_SANDBOX=bwrap diminta tetapi binary/namespace bwrap tidak tersedia (fail-closed)");
    }
  }

  async prepare(scope = {}) {
    this.#assertAvailable();
    const ws = path.resolve(scope.workspace || scope.cwd || this.workspace);
    const sp = scope.sp || this.sandbox || sandboxPaths(ws, { home: this.home });
    this.sandbox = sp;
    return { mode: this.name, ok: true, scope: sp };
  }

  wrapCommand(cmd, opts = {}) {
    this.#assertAvailable();
    const ws = path.resolve(opts.workspaceDir || opts.workspace || opts.cwd || this.workspace);
    const argsDir = opts.argsDir || this.argsDir || path.join(ws, ".tmp", "sbx");
    const wrapped = bwrapCommand(String(cmd ?? ""), {
      workspace: ws,
      toolDirs: opts.toolDirs || this.toolDirs,
      argsDir,
      env: opts.env || this.env,
      sandbox: opts.sandbox || this.sandbox,
      home: opts.home || this.home,
    });
    const m = wrapped.match(/ 3<'([^']+)'$/);
    if (m && m[1]) this.#argsFiles.add(m[1].replace(/'\\''/g, "'"));
    return {
      command: wrapped,
      ...(opts?.env ? { env: { ...opts.env } } : {}),
    };
  }

  async exec(cmd, opts = {}) {
    this.#assertAvailable();
    const ws = path.resolve(opts.workspaceDir || opts.workspace || opts.cwd || this.workspace);
    const args = bwrapArgs(String(cmd ?? ""), {
      workspace: ws,
      toolDirs: opts.toolDirs || this.toolDirs,
      env: opts.env || this.env,
      sandbox: opts.sandbox || this.sandbox,
      home: opts.home || this.home,
    });
    const res = spawnSync("bwrap", args, {
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 60000,
    });
    return {
      exitCode: typeof res.status === "number" ? res.status : 1,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? (res.error ? String(res.error.message || res.error) : ""),
    };
  }

  async cleanup() {
    for (const f of this.#argsFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    this.#argsFiles.clear();
  }
}

export class RemoteSandboxAdapter {
  #fetchImpl;

  constructor(opts = {}) {
    this.name = "remote";
    this.env = opts.env || process.env;
    this.endpoint = String(opts.endpoint ?? this.env?.LUMI_SANDBOX_REMOTE_URL ?? "").trim();
    this.apiKey = String(opts.apiKey ?? opts.token ?? this.env?.LUMI_SANDBOX_REMOTE_KEY ?? "").trim();
    this.lumiHome = opts.lumiHome || this.env?.LUMI_HOME || path.join(this.env?.HOME || os.homedir(), ".lumitome");
    this.#fetchImpl = opts.fetchImpl || null;
  }

  isAvailable() {
    return Boolean(this.endpoint && /^https?:\/\//i.test(this.endpoint) && this.apiKey);
  }

  assertSafeScope(opts = {}) {
    const mounts = [
      ...(Array.isArray(opts.mounts) ? opts.mounts : []),
      ...(Array.isArray(opts.read) ? opts.read : []),
      ...(Array.isArray(opts.write) ? opts.write : []),
      ...(Array.isArray(opts.binds) ? opts.binds : []),
    ];
    for (const m of mounts) {
      const target = typeof m === "string" ? m : (m?.source || m?.src || m?.hostPath || m?.path || "");
      if (isCredentialPathOrRef(target, this.lumiHome)) {
        throw new Error(`SANDBOX_CREDENTIAL_MOUNT_DENIED: RemoteSandboxAdapter menolak mount path kredensial '${target}'`);
      }
    }
    if (opts.env && typeof opts.env === "object") {
      for (const k of Object.keys(opts.env)) {
        if (FORBIDDEN_REMOTE_ENV_KEYS.has(k)) {
          throw new Error(`SANDBOX_CREDENTIAL_MOUNT_DENIED: RemoteSandboxAdapter menolak injeksi env kredensial '${k}'`);
        }
      }
    }
  }

  #assertConfigured() {
    if (!this.isAvailable()) {
      throw new Error("SANDBOX_CLOSED: LUMI_SANDBOX=remote opt-in memerlukan endpoint (LUMI_SANDBOX_REMOTE_URL) & kredensial (LUMI_SANDBOX_REMOTE_KEY) yang valid");
    }
  }

  async prepare(scope = {}) {
    this.assertSafeScope(scope);
    this.#assertConfigured();
    return { mode: this.name, ok: true, endpoint: this.endpoint, scope };
  }

  wrapCommand(cmd, opts = {}) {
    this.assertSafeScope(opts);
    this.#assertConfigured();
    return {
      command: String(cmd ?? ""),
      env: opts?.env ? { ...opts.env } : undefined,
    };
  }

  async exec(cmd, opts = {}) {
    this.assertSafeScope(opts);
    this.#assertConfigured();
    if (typeof this.#fetchImpl !== "function") {
      throw new Error("SANDBOX_CLOSED: RemoteSandboxAdapter adalah stub opt-in dan tidak memiliki transport fetchImpl aktif");
    }
    const res = await this.#fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ command: String(cmd ?? ""), cwd: opts.cwd || opts.workspaceDir || "." }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!res.ok) {
      return { exitCode: 1, stdout: "", stderr: `remote sandbox HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      exitCode: typeof data?.exitCode === "number" ? data.exitCode : 0,
      stdout: String(data?.stdout ?? ""),
      stderr: String(data?.stderr ?? ""),
    };
  }

  async cleanup() {
    // Tidak ada state lokal yang persisten
  }
}

export function createSandboxProvider(env = process.env, opts = {}) {
  const mode = normalizeSandboxMode(opts.mode ?? env?.LUMI_SANDBOX);
  if (mode === "off") {
    return new NoopSandbox({ ...opts, env });
  }
  if (mode === "bwrap") {
    const provider = new BwrapSandbox({ ...opts, env });
    if (!provider.isAvailable()) {
      throw new Error("SANDBOX_CLOSED: LUMI_SANDBOX=bwrap diminta tetapi bwrap tidak tersedia (fail-closed)");
    }
    return provider;
  }
  if (mode === "remote") {
    const provider = new RemoteSandboxAdapter({ ...opts, env });
    if (!provider.isAvailable()) {
      throw new Error("SANDBOX_CLOSED: LUMI_SANDBOX=remote diminta tetapi endpoint/kredensial belum dikonfigurasi (fail-closed)");
    }
    return provider;
  }
  throw new Error(`SANDBOX_CLOSED: mode tidak didukung '${mode}'`);
}
