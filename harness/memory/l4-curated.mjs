/**
 * L4 Curated Memory + Taint Gate + TTL/Pruning (M3 / T3.2 & T3.3):
 * - Lokasi kanonis: ${LUMI_HOME:-$HOME/.lumitome}/memory/ (di luar runtime/ repo):
 *     - facts.jsonl
 *     - rules.jsonl
 *     - sim.jsonl
 *     - staging-tainted.jsonl (penampung sementara saat sesi TAINTED)
 * - Gate Monotonic Sticky Taint: menolak promosi otomatis saat sesi TAINTED
 *   (decision: "HOLD_FOR_APPROVAL") tanpa approval eksplisit user.
 * - Secret scrubbing wajib sebelum menulis ke disk.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { scrubSecrets } from "../context-budget.mjs";
import { resolveCompatLumiHome } from "../../lumitome/lib/env-compat.mjs";

function sha256File(absPath) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
  } catch {
    return null;
  }
}

function sanitizeValue(val) {
  if (typeof val === "string") {
    return scrubSecrets(val.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim());
  }
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = sanitizeValue(v);
    return out;
  }
  return val;
}

export function resolveMemoryDir({ lumiHome, memoryDir, env = process.env } = {}) {
  if (memoryDir) return path.resolve(memoryDir);
  const home = lumiHome ? path.resolve(lumiHome) : resolveCompatLumiHome(env);
  return path.join(home, "memory");
}

export function l4Paths(dir) {
  const base = path.resolve(dir);
  return {
    dir: base,
    facts: path.join(base, "facts.jsonl"),
    rules: path.join(base, "rules.jsonl"),
    sim: path.join(base, "sim.jsonl"),
    stagingTainted: path.join(base, "staging-tainted.jsonl"),
  };
}

export function readJsonl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const out = [];
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj && typeof obj === "object") out.push(obj);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

function writeJsonlAtomic(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, filePath);
}

function appendJsonl(filePath, row) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(row) + "\n", "utf8");
}

function promoteToL4(targetKind, entry, {
  lumiHome,
  memoryDir,
  env = process.env,
  taintTracker = null,
  userApproved = false,
  ttlDays = null,
  throwOnTaint = false,
} = {}) {
  const dir = resolveMemoryDir({ lumiHome, memoryDir, env });
  const paths = l4Paths(dir);
  const clean = sanitizeValue(entry || {});
  const nowMs = Date.now();
  const ts = clean.ts || new Date(nowMs).toISOString();
  const expiresAt = ttlDays !== null && Number.isFinite(ttlDays)
    ? new Date(nowMs + ttlDays * 86400 * 1000).toISOString()
    : (clean.expires_at ?? null);

  if (taintTracker) {
    const gate = taintTracker.checkPromotion({ userApproved });
    if (!gate.allowed) {
      const staged = {
        ...clean,
        target: targetKind,
        ts,
        taint_state: "TAINTED",
        decision: "HOLD_FOR_APPROVAL",
      };
      appendJsonl(paths.stagingTainted, staged);
      if (throwOnTaint) {
        const err = new Error(`TAINT_VIOLATION: ${gate.reason}`);
        err.code = "TAINT_VIOLATION";
        err.decision = "HOLD_FOR_APPROVAL";
        throw err;
      }
      return {
        promoted: false,
        decision: "HOLD_FOR_APPROVAL",
        reason: gate.reason,
        stagingPath: paths.stagingTainted,
        entry: staged,
      };
    }
  }

  const targetPath = targetKind === "rules" ? paths.rules : paths.facts;
  const record = {
    ...clean,
    ts,
    taint_state: taintTracker?.isTainted ? "tainted_approved" : "clean",
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(targetKind === "facts" ? { derived_from: Array.isArray(clean.derived_from) ? clean.derived_from : [] } : {}),
  };
  appendJsonl(targetPath, record);
  return {
    promoted: true,
    decision: userApproved && taintTracker?.isTainted ? "ALLOW_USER_APPROVED" : "ALLOW",
    path: targetPath,
    entry: record,
  };
}

export function promoteFact(entry, opts = {}) {
  return promoteToL4("facts", entry, opts);
}

export function promoteRule(entry, opts = {}) {
  return promoteToL4("rules", entry, opts);
}

export function appendSim(entry, { lumiHome, memoryDir, env = process.env } = {}) {
  const dir = resolveMemoryDir({ lumiHome, memoryDir, env });
  const paths = l4Paths(dir);
  const clean = sanitizeValue(entry || {});
  const record = {
    ts: clean.ts || new Date().toISOString(),
    ...clean,
  };
  appendJsonl(paths.sim, record);
  return { path: paths.sim, entry: record };
}

export function readL4({ lumiHome, memoryDir, env = process.env } = {}) {
  const dir = resolveMemoryDir({ lumiHome, memoryDir, env });
  const paths = l4Paths(dir);
  return {
    dir,
    paths,
    facts: readJsonl(paths.facts),
    rules: readJsonl(paths.rules),
    sim: readJsonl(paths.sim),
    stagingTainted: readJsonl(paths.stagingTainted),
  };
}

/**
 * Hapus entri kedaluwarsa berdasarkan expires_at (TTL pruning) secara atomik.
 */
export function pruneExpiredL4({ lumiHome, memoryDir, env = process.env, now = Date.now() } = {}) {
  const dir = resolveMemoryDir({ lumiHome, memoryDir, env });
  const paths = l4Paths(dir);
  const isFresh = (row) => {
    if (!row?.expires_at) return true;
    const exp = Date.parse(row.expires_at);
    return Number.isNaN(exp) || exp > now;
  };

  let prunedFacts = 0;
  let prunedRules = 0;
  const facts = readJsonl(paths.facts);
  if (facts.length) {
    const kept = facts.filter(isFresh);
    prunedFacts = facts.length - kept.length;
    if (prunedFacts > 0) writeJsonlAtomic(paths.facts, kept);
  }
  const rules = readJsonl(paths.rules);
  if (rules.length) {
    const kept = rules.filter(isFresh);
    prunedRules = rules.length - kept.length;
    if (prunedRules > 0) writeJsonlAtomic(paths.rules, kept);
  }
  return {
    prunedFacts,
    prunedRules,
    remainingFacts: facts.length - prunedFacts,
    remainingRules: rules.length - prunedRules,
  };
}

/**
 * Compaction offline deterministik (0 LLM write):
 * Validasi ulang hash derived_from pada facts.jsonl & buang fakta STALE / tainted.
 */
export function compactCleanMemory({ lumiHome, memoryDir, workspace = process.cwd(), env = process.env, now = Date.now() } = {}) {
  const dir = resolveMemoryDir({ lumiHome, memoryDir, env });
  const paths = l4Paths(dir);
  const ws = path.resolve(workspace);
  const facts = readJsonl(paths.facts);
  const kept = [];
  let droppedStale = 0;
  let droppedTainted = 0;

  for (const f of facts) {
    if (String(f.taint_state || "").toLowerCase().includes("tainted") && f.taint_state !== "tainted_approved") {
      droppedTainted++;
      continue;
    }
    if (f.expires_at) {
      const exp = Date.parse(f.expires_at);
      if (!Number.isNaN(exp) && exp <= now) {
        droppedStale++;
        continue;
      }
    }
    const deps = Array.isArray(f.derived_from) ? f.derived_from : [];
    const staleDep = deps.some((d) => {
      if (!d?.path || !d?.sha256) return false;
      const abs = path.isAbsolute(d.path) ? d.path : path.join(ws, d.path);
      const cur = sha256File(abs);
      return cur !== d.sha256;
    });
    if (staleDep) {
      droppedStale++;
      continue;
    }
    kept.push(f);
  }
  if (droppedStale > 0 || droppedTainted > 0) {
    writeJsonlAtomic(paths.facts, kept);
  }
  return { kept: kept.length, droppedStale, droppedTainted };
}
