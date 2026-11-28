/**
 * Service engine milik Lumitome (`opencode serve --service` yang dinyalakan TUI, state di $LUMI_HOME/state).
 * PID diambil dari registrasi engine $LUMI_HOME/state/opencode/service.json — hanya service milik LUMI_HOME ini.
 * Service OpenCode milik user (state di ~/.local/state/opencode) tidak pernah dibaca atau dimatikan.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
export const regFile = (home) => path.join(home, "state", "opencode", "service.json");
export const fpFile = (home) => path.join(home, "state", "lumitome-service.json");
export const alive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** {running, pid, url} dari registrasi engine milik LUMI_HOME ini. */
export function status(home) {
  const reg = readJson(regFile(home));
  const pid = Number(reg?.pid);
  const running = alive(pid);
  return { running, pid: running ? pid : null, url: running ? reg?.url || null : null };
}

/** PID service + seluruh turunannya (Linux /proc; di OS lain hanya PID service). */
export function protectedPids(home, { procRoot = "/proc" } = {}) {
  const st = status(home); const out = new Set(); if (!st.running) return out;
  out.add(st.pid);
  if (!fs.existsSync(path.join(procRoot, "self"))) return out;
  const parent = new Map();
  for (const d of fs.readdirSync(procRoot)) {
    if (!/^\d+$/.test(d)) continue;
    try { const t = fs.readFileSync(path.join(procRoot, d, "stat"), "utf8"); const ppid = Number(t.slice(t.lastIndexOf(")") + 2).split(" ")[1]); parent.set(Number(d), ppid); } catch {}
  }
  let grew = true;
  while (grew) { grew = false; for (const [p, pp] of parent) if (!out.has(p) && out.has(pp)) { out.add(p); grew = true; } }
  return out;
}

/** Hentikan service milik LUMI_HOME ini (+ turunan). Return true bila ada yang dihentikan.
 * v0.3.44: tunggu SIGTERM 1 dtk (dulu 3 dtk) — service sehat mati jauh sebelum itu;
 * yang mengabaikan SIGTERM langsung SIGKILL setelah 1 dtk, bukan menahan startup 3 dtk. */
export function stop(home, { wait = 1000 } = {}) {
  const st = status(home);
  try { fs.rmSync(fpFile(home), { force: true }); } catch {}
  if (!st.running) return false;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/PID", String(st.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch { try { process.kill(st.pid); } catch {} }
  } else {
    const pids = [...protectedPids(home)];
    for (const p of pids) try { process.kill(p, "SIGTERM"); } catch {}
    const t0 = Date.now(); while (Date.now() - t0 < wait && pids.some(alive)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    for (const p of pids) if (alive(p)) try { process.kill(p, "SIGKILL"); } catch {}
  }
  return true;
}

/** Sidik config service: berubah (versi, config, key provider) → service lama dihentikan agar config baru terpakai. */
export function fingerprint(parts) { return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex"); }

/**
 * Hash isi preset + baris model file agent (v0.3.76, LEAK #1/B).
 * Fingerprint daemon WAJIB berubah bila preset/file agent berubah, supaya
 * TUI baru sesudah ganti preset tidak me-reuse daemon basi (cache agent
 * dari boot lama — daemon hanya memuat .opencode/agents/*.md sekali).
 * Preset di-hash mentah (byte file); file agent di-hash baris `model:`-nya
 * saja (isi prompt lain tidak memengaruhi model). File tidak ada → dilewati
 * (bukan error); tidak ada satu pun → null (fingerprint lama tidak berubah).
 */
export function presetAgentHash({ home, root }) {
  const h = crypto.createHash("sha256");
  let found = false;
  const feed = (s) => { h.update(s); h.update("\0"); found = true; };
  try { feed(fs.readFileSync(path.join(home, "lumitome-subagent.json"))); } catch {}
  for (const role of ["thinking", "search", "builder", "reviewer"]) {
    try {
      const t = fs.readFileSync(path.join(root, ".opencode", "agents", `${role}.md`), "utf8");
      const m = t.match(/^model:\s*(\S+)\s*$/m);
      if (m) feed(`${role}:${m[1]}`);
    } catch {}
  }
  return found ? h.digest("hex") : null;
}

/** Pastikan service yang hidup memakai sidik `fp`; bila beda → stop. Return "reuse" | "restart" | "none". */
export function ensureFresh(home, fp) {
  const st = status(home);
  const cur = readJson(fpFile(home))?.fp;
  let r = "none";
  if (st.running && cur === fp) r = "reuse";
  else if (st.running) { stop(home); r = "restart"; }
  fs.mkdirSync(path.dirname(fpFile(home)), { recursive: true });
  fs.writeFileSync(fpFile(home), JSON.stringify({ fp }) + "\n", { mode: 0o600 });
  return r;
}

/** Daftar ID plugin wajib untuk readiness polling /api/plugin. */
export function requiredPluginIds({ repo = "", ws = "" } = {}) {
  const ids = ["lumitome-guard", "lumitome.subagent"];
  if (repo && fs.existsSync(path.join(repo, "lumitome", "config", "plugins", "lumitome-idle-gate.ts"))) {
    ids.push("lumitome-idle-gate");
  }
  if (repo && fs.existsSync(path.join(repo, "lumitome", "config", "plugins", "lumitome-cascade.ts"))) {
    ids.push("lumitome-cascade");
  }
  const checkHarness = (d) => Boolean(d && fs.existsSync(path.join(d, ".opencode", "plugins", "lumitome-harness.ts")));
  if (checkHarness(ws) || checkHarness(repo)) ids.push("lumitome-harness");
  return ids;
}

/**
 * Poll GET /api/plugin dengan backoff terukur sampai semua plugin wajib berstatus `active`
 * (mitigasi async plugin loading OpenCode 2.4.x #63814).
 */
export async function waitForPluginsReady(baseUrl, authHeader = "", requiredIds = ["lumitome-guard", "lumitome.subagent"], opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 50;
  const maxIntervalMs = opts.maxIntervalMs ?? 250;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleepImpl = opts.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const directory = opts.directory ? `?directory=${encodeURIComponent(opts.directory)}` : "";
  const url = `${String(baseUrl || "").replace(/\/+$/, "")}/api/plugin${directory}`;
  const headers = { accept: "application/json", ...(authHeader ? { authorization: authHeader } : {}) };
  const t0 = Date.now();
  let delay = intervalMs;
  let attempts = 0;
  let lastPlugins = [];
  let lastError = null;
  for (;;) {
    attempts++;
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(Math.max(250, timeoutMs)) });
      if (res.ok) {
        const body = await res.json();
        const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        lastPlugins = list;
        const active = list.filter((p) => (p?.state?.status ?? p?.status) === "active").map((p) => p.id);
        const missing = requiredIds.filter((id) => !active.includes(id));
        if (missing.length === 0) {
          return { ok: true, active, missing: [], plugins: list, attempts, ms: Date.now() - t0 };
        }
        lastError = null;
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (e) {
      lastError = e?.message || String(e);
    }
    const elapsed = Date.now() - t0;
    if (elapsed >= timeoutMs) {
      const active = lastPlugins.filter((p) => (p?.state?.status ?? p?.status) === "active").map((p) => p.id);
      const missing = requiredIds.filter((id) => !active.includes(id));
      const warning = `plugin belum aktif dalam ${timeoutMs} ms (${missing.join(", ")})${lastError ? `: ${lastError}` : ""}`;
      if (opts.throwOnTimeout) throw new Error(warning);
      return { ok: false, active, missing, plugins: lastPlugins, attempts, ms: elapsed, warning };
    }
    await sleepImpl(Math.min(delay, Math.max(1, timeoutMs - elapsed)));
    delay = Math.min(maxIntervalMs, Math.round(delay * 1.5));
  }
}
