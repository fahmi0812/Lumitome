/**
 * Repro-Before-Edit Gate (RED -> GREEN) & Detektor INVALID_PROBE (M4 / T2.2).
 * Hanya mengimpor node:* agar zero-dependency dan aman dipakai di plugin/guard.
 *
 * Kontrak:
 * - taskType === "bugfix": tolak edit kode pertama sebelum ada probe VALID_REPRO.
 * - taskType !== "bugfix" (feature, refactor, docs, docs_config, general): tidak memblokir edit sah.
 * - Flag diagnostik LUMI_REPRO_GATE=0 diabaikan saat headless (lumitome run / LUMI_HEADLESS=1)
 *   atau strictGate (G6/G7).
 */
import fs from "node:fs";
import path from "node:path";

export const WRITE_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"]);
export const TASK_TYPES = new Set(["bugfix", "feature", "refactor", "docs_config", "docs", "general"]);

const INVALID_PROBE_PATTERNS = [
  /command not found|not recognized as an internal or external command/i,
  /\bENOENT\b|No such file or directory|can't open file|Cannot open file/i,
  /\b(?:SyntaxError|IndentationError|ModuleNotFoundError|ImportError|ERR_MODULE_NOT_FOUND)\b|Cannot find module/i,
  /\bno tests collected\b|\bcollected 0 items\b|\b0 tests\b|\b0 ran\b|\bno test files\b/i,
  /\bbwrap:|SANDBOX_CLOSED/i,
  /^(?:sh|bash|zsh):\s+.*(?:syntax error|unexpected|not found|permission denied)/im,
];

const SYNTAX_OR_USAGE_EXIT2_RE = /usage:|unrecognized arguments?|unknown option|invalid option|syntax error|unexpected token|missing|cannot access|no such file/i;
const REAL_TEST_FAIL_RE = /\b(?:AssertionError|AssertionError\b|Expected:|Received:|not ok \d+|FAIL\s+\S|--- FAIL:|Tests?:\s+\d+ failed|failed,\s*\d+ passed|\d+\s+failed)\b/i;

export function sanitizeSessionId(sessionId = "default") {
  const s = String(sessionId || "default").replace(/[^A-Za-z0-9._-]/g, "_");
  return s || "default";
}

export function reproStatePath(workspace = process.cwd(), sessionId = "default") {
  return path.join(path.resolve(workspace), ".tmp", "session", sanitizeSessionId(sessionId), "repro-state.json");
}

export function normalizeTaskType(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "general";
  if (v === "bug" || v === "bug-fix" || v === "fix") return "bugfix";
  if (TASK_TYPES.has(v)) return v;
  return "general";
}

export function readTaskTypeFromSpec(workspace, sessionId = "default") {
  try {
    const p = path.join(path.resolve(workspace), ".tmp", "session", sanitizeSessionId(sessionId), "task_spec.json");
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const t = raw?.task_type ?? raw?.taskType;
    return t ? normalizeTaskType(t) : null;
  } catch {
    return null;
  }
}

export function createReproState({ taskType = "general", sessionId = "default" } = {}) {
  return {
    version: 1,
    sessionId: sanitizeSessionId(sessionId),
    taskType: normalizeTaskType(taskType),
    hasValidRepro: false,
    lastProbeStatus: null,
    lastProbeReason: null,
    probes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadReproState(workspace, sessionId = "default") {
  const file = reproStatePath(workspace, sessionId);
  if (!fs.existsSync(file)) {
    const specType = readTaskTypeFromSpec(workspace, sessionId);
    return createReproState({ taskType: specType || "general", sessionId });
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...createReproState({ sessionId }),
      ...parsed,
      taskType: normalizeTaskType(parsed?.taskType ?? parsed?.task_type),
      probes: Array.isArray(parsed?.probes) ? parsed.probes : [],
    };
  } catch {
    return createReproState({ sessionId });
  }
}

export function saveReproState(workspace, sessionId = "default", state) {
  const file = reproStatePath(workspace, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

/**
 * Klasifikasi hasil probe shell:
 * - exit === 0 -> PASS_NO_REPRO
 * - exit 126/127, exit 2 (syntax/missing cmd), exit 5 (empty pytest), atau pola env/syntax -> INVALID_PROBE
 * - exit > 0 valid dari tes/repro -> VALID_REPRO
 */
export function classifyProbeResult({ command = "", exitCode, output = "" } = {}) {
  if (exitCode === null || exitCode === undefined) {
    return { status: "PENDING_BG", validRepro: false, invalidProbe: false, reason: "perintah berjalan di background (exitCode null)" };
  }
  const code = Number(exitCode);
  const out = String(output ?? "");
  if (!Number.isFinite(code)) {
    return { status: "INVALID_PROBE", validRepro: false, invalidProbe: true, reason: "exitCode tidak valid" };
  }
  if (code === 0) {
    return { status: "PASS_NO_REPRO", validRepro: false, invalidProbe: false, reason: "probe exit 0 (tidak mereproduksi kegagalan)" };
  }
  if (code === 127 || code === 126) {
    return { status: "INVALID_PROBE", validRepro: false, invalidProbe: true, reason: `exit=${code} (command not found / permission denied)` };
  }
  if (code === 5 && /no tests collected|collected 0 items/i.test(out)) {
    return { status: "INVALID_PROBE", validRepro: false, invalidProbe: true, reason: "exit=5 (no tests collected)" };
  }
  for (const re of INVALID_PROBE_PATTERNS) {
    const m = out.match(re);
    if (m) {
      return { status: "INVALID_PROBE", validRepro: false, invalidProbe: true, reason: `pola probe tidak valid: ${m[0]}` };
    }
  }
  if (code === 2) {
    if (SYNTAX_OR_USAGE_EXIT2_RE.test(out) || !REAL_TEST_FAIL_RE.test(out)) {
      return { status: "INVALID_PROBE", validRepro: false, invalidProbe: true, reason: "exit=2 (syntax/missing cmd atau usage error pada probe)" };
    }
  }
  return {
    status: "VALID_REPRO",
    validRepro: true,
    invalidProbe: false,
    reason: `probe mereproduksi kegagalan (exit=${code})`,
    command: String(command),
  };
}

export function isReproGateDisabled({ env = process.env, headless = false, strictGate = false } = {}) {
  const flagOff = String(env?.LUMI_REPRO_GATE ?? "") === "0";
  if (!flagOff) return false;
  // Invarian permanen: ditolak/diabaikan pada mode headless atau strictGate (G6/G7)
  if (headless || String(env?.LUMI_HEADLESS ?? "") === "1") return false;
  if (strictGate || String(env?.LUMI_STRICT_GATE ?? "") === "1") return false;
  return true;
}

export function isExecuteMutatingCode(code) {
  const src = String(code ?? "");
  return /\b(?:Bun\.write|writeFile(?:Sync)?|appendFile(?:Sync)?|rm(?:Sync)?|unlink(?:Sync)?|rename(?:Sync)?|copyFile(?:Sync)?)\s*\(/.test(src);
}

export function isMutatingEditAction(tool, input = {}) {
  const t = String(tool || "");
  if (WRITE_TOOLS.has(t)) return true;
  if (t === "execute" && isExecuteMutatingCode(input?.code)) return true;
  return false;
}

export function resolveEffectiveTaskType({ taskType, state, workspace, sessionId = "default", env = process.env } = {}) {
  if (taskType) return normalizeTaskType(taskType);
  if (state?.taskType && state.taskType !== "general") return normalizeTaskType(state.taskType);
  if (workspace) {
    const fromSpec = readTaskTypeFromSpec(workspace, sessionId);
    if (fromSpec) return fromSpec;
  }
  if (env?.LUMI_TASK_TYPE) return normalizeTaskType(env.LUMI_TASK_TYPE);
  return normalizeTaskType(state?.taskType || "general");
}

export function recordReproProbe({
  state,
  workspace,
  sessionId = "default",
  command = "",
  exitCode,
  output = "",
} = {}) {
  const cur = state || (workspace ? loadReproState(workspace, sessionId) : createReproState({ sessionId }));
  const cls = classifyProbeResult({ command, exitCode, output });
  cur.probes = Array.isArray(cur.probes) ? cur.probes : [];
  cur.probes.push({
    command: String(command),
    exitCode: exitCode ?? null,
    status: cls.status,
    reason: cls.reason,
    ts: new Date().toISOString(),
  });
  cur.lastProbeStatus = cls.status;
  cur.lastProbeReason = cls.reason;
  if (cls.validRepro) cur.hasValidRepro = true;
  if (workspace) saveReproState(workspace, sessionId, cur);
  return { state: cur, classification: cls };
}

/**
 * Evaluasi apakah edit kode diizinkan sebelum repro.
 * Hanya memblokir saat taskType === "bugfix" dan belum ada VALID_REPRO.
 */
export function checkReproBeforeEdit({
  tool,
  input = {},
  state,
  taskType,
  workspace,
  sessionId = "default",
  env = process.env,
  headless = false,
  strictGate = false,
} = {}) {
  const effType = resolveEffectiveTaskType({ taskType, state, workspace, sessionId, env });
  if (effType !== "bugfix") {
    return { effect: "allow", enforced: false, taskType: effType };
  }
  if (!isMutatingEditAction(tool, input)) {
    return { effect: "allow", enforced: true, taskType: effType };
  }
  if (isReproGateDisabled({ env, headless, strictGate })) {
    return { effect: "allow", enforced: false, bypassedByFlag: true, taskType: effType };
  }
  const cur = state || (workspace ? loadReproState(workspace, sessionId) : createReproState({ taskType: effType, sessionId }));
  if (cur.hasValidRepro) {
    return { effect: "allow", enforced: true, taskType: effType };
  }
  if (cur.lastProbeStatus === "INVALID_PROBE") {
    return {
      effect: "deny",
      rule: "repro-gate",
      code: "invalid-probe",
      taskType: effType,
      reason: `[REPRO_GATE] invalid-probe: probe repro sebelumnya tidak sah (${cur.lastProbeReason}). Perbaiki perintah probe sampai mendapat kegagalan tes/repro nyata (VALID_REPRO) sebelum edit kode.`,
    };
  }
  if (cur.lastProbeStatus === "PASS_NO_REPRO") {
    return {
      effect: "deny",
      rule: "repro-gate",
      code: "repro-required",
      taskType: effType,
      reason: "[REPRO_GATE] repro-required: probe awal exit 0 (PASS_NO_REPRO). Uji 1-2 skenario edge-case untuk mereproduksi bug atau laporkan ABSTAIN / ALREADY_FIXED bila kode sudah benar — jangan edit kode membabi buta.",
    };
  }
  return {
    effect: "deny",
    rule: "repro-gate",
    code: "repro-required",
    taskType: effType,
    reason: "[REPRO_GATE] repro-required: tugas bugfix wajib menjalankan probe reproduksi yang sah (VALID_REPRO / RED) sebelum edit kode pertama.",
  };
}
