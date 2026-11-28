/**
 * Monotonic Sticky Taint Tracker (M3 / T3.2 & T3.3).
 *
 * Lattice satu arah: "CLEAN" -> "TAINTED" (db: "clean" -> "tainted_external").
 * Sekali TAINTED, status tidak pernah dapat diturunkan kembali ke CLEAN
 * oleh instruksi, prompt, atau pemanggilan metode reset dalam sesi yang sama.
 */
import fs from "node:fs";
import path from "node:path";

export const TAINT_CLEAN = "CLEAN";
export const TAINT_TAINTED = "TAINTED";

export const UNTRUSTED_TOOLS = new Set(["webfetch", "websearch"]);
export const TRUSTED_INTERNAL_MCP = new Set(["codemem", "skills"]);
export const UNTRUSTED_MCP_SERVERS = new Set([
  "github",
  "parallel",
  "figma",
  "stitch",
  "playwright",
  "chromedev",
  "markitdown",
  "context7",
  "drawio",
  "figcraft",
  "platformio",
  "blender",
  "tableau",
]);

const PROMPT_INJECTION_RE =
  /(?:ignore\s+(?:all\s+)?previous\s+instructions|abaikan\s+(?:semua\s+)?instruksi\s+sebelumnya|<\|im_start\|>|\[SYSTEM\s*OVERRIDE\]|disregard\s+(?:all\s+)?prior\s+rules)/i;

function normalizeTaintInput(level) {
  const s = String(level ?? "").trim().toUpperCase();
  if (s === "TAINTED" || s === "TAINTED_EXTERNAL") return TAINT_TAINTED;
  return TAINT_CLEAN;
}

export function isUntrustedTrigger({ tool = "", mcpServer = "", untrusted = false, source = "", output = "" } = {}) {
  if (untrusted === true) {
    return { triggered: true, reason: "input:untrusted" };
  }
  const srcLower = String(source || "").toLowerCase();
  if (srcLower === "untrusted" || srcLower === "external" || srcLower === "web") {
    return { triggered: true, reason: `source:${srcLower}` };
  }
  const t = String(tool || "").trim().toLowerCase();
  if (UNTRUSTED_TOOLS.has(t)) {
    return { triggered: true, reason: `tool:${t}` };
  }
  const mcp = String(mcpServer || "").trim().toLowerCase();
  if (mcp && !TRUSTED_INTERNAL_MCP.has(mcp)) {
    return { triggered: true, reason: `mcp:${mcp}` };
  }
  for (const srv of UNTRUSTED_MCP_SERVERS) {
    if (t === srv || t.startsWith(`${srv}_`) || t.startsWith(`${srv}:`) || t.startsWith(`${srv}.`)) {
      return { triggered: true, reason: `mcp:${srv}` };
    }
  }
  if (t.startsWith("mcp_") || t.startsWith("mcp:")) {
    const rest = t.slice(4);
    const prefix = rest.split(/[_:.]/)[0];
    if (!TRUSTED_INTERNAL_MCP.has(prefix)) {
      return { triggered: true, reason: `mcp:${prefix || "external"}` };
    }
  }
  if (output && PROMPT_INJECTION_RE.test(String(output))) {
    return { triggered: true, reason: "prompt_injection_pattern" };
  }
  return { triggered: false, reason: null };
}

export class SessionTaintTracker {
  #sessionId;
  #taintLevel;
  #stateFile;
  #events;

  constructor({ sessionId = "default", initialLevel = TAINT_CLEAN, stateFile = null } = {}) {
    this.#sessionId = String(sessionId || "default");
    this.#stateFile = stateFile ? path.resolve(stateFile) : null;
    this.#events = [];
    this.#taintLevel = normalizeTaintInput(initialLevel);
    this.#loadFromDisk();
  }

  #loadFromDisk() {
    if (!this.#stateFile || !fs.existsSync(this.#stateFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.#stateFile, "utf8"));
      if (normalizeTaintInput(data?.taintLevel) === TAINT_TAINTED) {
        this.#taintLevel = TAINT_TAINTED;
      }
      if (Array.isArray(data?.events)) {
        this.#events = data.events.slice(-100);
      }
    } catch {
      // fail-safe: abaikan file state rusak tanpa menurunkan taint
    }
  }

  #saveToDisk() {
    if (!this.#stateFile) return;
    try {
      fs.mkdirSync(path.dirname(this.#stateFile), { recursive: true });
      fs.writeFileSync(
        this.#stateFile,
        JSON.stringify(
          {
            sessionId: this.#sessionId,
            taintLevel: this.#taintLevel,
            taintStateDb: this.taintStateDb,
            events: this.#events.slice(-100),
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
    } catch {
      // persist best-effort
    }
  }

  get sessionId() {
    return this.#sessionId;
  }

  get taintLevel() {
    return this.#taintLevel;
  }

  get isTainted() {
    return this.#taintLevel === TAINT_TAINTED;
  }

  get taintStateDb() {
    return this.isTainted ? "tainted_external" : "clean";
  }

  get events() {
    return [...this.#events];
  }

  markTainted(reason = "external_untrusted", meta = {}) {
    const prev = this.#taintLevel;
    this.#taintLevel = TAINT_TAINTED;
    this.#events.push({
      ts: new Date().toISOString(),
      kind: "taint-elevated",
      from: prev,
      to: TAINT_TAINTED,
      reason: String(reason || "external_untrusted"),
      ...meta,
    });
    this.#saveToDisk();
    return this.status();
  }

  recordToolOrInput(info = {}) {
    const chk = isUntrustedTrigger(info);
    if (chk.triggered) {
      this.markTainted(chk.reason, {
        ...(info.tool ? { tool: info.tool } : {}),
        ...(info.mcpServer ? { mcpServer: info.mcpServer } : {}),
        ...(info.source ? { source: info.source } : {}),
      });
    }
    return {
      taintLevel: this.#taintLevel,
      isTainted: this.isTainted,
      triggered: chk.triggered,
      reason: chk.reason,
    };
  }

  /** Monotonic invariant: penolakan keras upaya penurunan taint ke CLEAN. */
  #rejectDowngrade(methodName, reason = "") {
    if (!this.isTainted) {
      return { ok: true, rejected: false, taintLevel: this.#taintLevel };
    }
    this.#events.push({
      ts: new Date().toISOString(),
      kind: "downgrade-rejected",
      method: methodName,
      reason: String(reason || "monotonic sticky taint"),
      taintLevel: this.#taintLevel,
    });
    this.#saveToDisk();
    return {
      ok: false,
      rejected: true,
      taintLevel: this.#taintLevel,
      error: "MONOTONIC_TAINT_VIOLATION: status TAINTED tidak dapat diturunkan ke CLEAN dalam sesi yang sama",
    };
  }

  reset(reason = "") {
    return this.#rejectDowngrade("reset", reason);
  }

  clearTaint(reason = "") {
    return this.#rejectDowngrade("clearTaint", reason);
  }

  downgrade(reason = "") {
    return this.#rejectDowngrade("downgrade", reason);
  }

  setLevel(nextLevel, reason = "") {
    if (normalizeTaintInput(nextLevel) === TAINT_TAINTED) {
      return { ok: true, rejected: false, ...this.markTainted(reason || "setLevel") };
    }
    return this.#rejectDowngrade("setLevel", reason);
  }

  checkPromotion({ userApproved = false } = {}) {
    if (!this.isTainted) {
      return { allowed: true, decision: "ALLOW", taintLevel: this.#taintLevel };
    }
    if (userApproved === true) {
      return { allowed: true, decision: "ALLOW_USER_APPROVED", taintLevel: this.#taintLevel };
    }
    return {
      allowed: false,
      decision: "HOLD_FOR_APPROVAL",
      taintLevel: this.#taintLevel,
      reason: "Sesi TAINTED (untrusted external data): promosi otomatis ke L4 ditahan untuk persetujuan eksplisit user",
    };
  }

  status() {
    return {
      sessionId: this.#sessionId,
      taintLevel: this.#taintLevel,
      isTainted: this.isTainted,
      taintStateDb: this.taintStateDb,
      events: this.events,
    };
  }
}
