/**
 * BYOP Guardrail Proxy Shadow Mode (M5 / T4.2).
 *
 * - 100% melalui 9router (resolveCompat9RouterUrl -> http://127.0.0.1:20128/v1/chat/completions).
 *   Nol sidecar/endpoint di luar 9router.
 * - Khusus aksi kelas "commit" (lookup & verify dilewati tanpa network call).
 * - Context stripping wajib: buang seluruh narasi percakapan/prompt history/<think>
 *   dan scrub rahasia sebelum dikirim ke model guardrail.
 * - Default LUMI_BYOP_MODE=shadow (timeout ketat 350 ms, log ke $LUMI_HOME/telemetry/byop-shadow.jsonl).
 * - Enforce guard keras: permintaan LUMI_BYOP_MODE=enforce ditolak/downgrade otomatis ke shadow
 *   kecuali ada laporan probe lokal terverifikasi dengan FPR < 0.01 (<1%) dan p95_ms <= 350.
 */
import fs from "node:fs";
import path from "node:path";
import { scrubSecrets } from "./context-budget.mjs";
import {
  resolveCompat9RouterKey,
  resolveCompat9RouterUrl,
  resolveCompatLumiHome,
} from "../lumitome/lib/env-compat.mjs";

export const DEFAULT_BYOP_TIMEOUT_MS = 350;
export const MAX_ENFORCE_FPR = 0.01;
export const MAX_ENFORCE_P95_MS = 350;
export const DEFAULT_BYOP_MODEL = "9router/guardrail";

const STRIPPED_CONTEXT_KEYS = new Set([
  "history",
  "messages",
  "conversation",
  "prompt",
  "promptHistory",
  "chatHistory",
  "reasoning",
  "think",
  "thoughts",
  "narrative",
  "justification",
  "systemPrompt",
]);

function scrubDeep(val, depth = 0) {
  if (depth > 8) return "[TRUNCATED]";
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    const noThink = val.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
    return scrubSecrets(noThink);
  }
  if (typeof val === "number" || typeof val === "boolean") return val;
  if (Array.isArray(val)) return val.slice(0, 32).map((item) => scrubDeep(item, depth + 1));
  if (typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (STRIPPED_CONTEXT_KEYS.has(k)) continue;
      out[k] = scrubDeep(v, depth + 1);
    }
    return out;
  }
  return scrubSecrets(String(val));
}

export function resolveByopTelemetryPath(env = process.env, lumiHome = "") {
  const home = lumiHome ? path.resolve(lumiHome) : resolveCompatLumiHome(env);
  return path.join(home, "telemetry", "byop-shadow.jsonl");
}

export function resolveByopProbePath(env = process.env, lumiHome = "") {
  const home = lumiHome ? path.resolve(lumiHome) : resolveCompatLumiHome(env);
  return path.join(home, "telemetry", "byop-probe.json");
}

export function resolve9RouterChatUrl(env = process.env) {
  const base = resolveCompat9RouterUrl(env).replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

/**
 * Bangun payload guardrail bebas-narasi & bebas-rahasia (100% melalui 9router).
 */
export function buildGuardrailPayload({
  actionClass = "commit",
  toolName = "",
  sanitizedArgs = {},
  taintState = "clean",
  model,
  env = process.env,
} = {}) {
  const cleanArgs = scrubDeep(sanitizedArgs ?? {});
  const cleanTool = scrubDeep(String(toolName ?? ""));
  const cleanTaint = String(taintState || "clean").toLowerCase().includes("taint")
    ? "tainted_external"
    : "clean";
  const cleanClass = String(actionClass || "commit");
  const modelId = String(model || env?.LUMI_BYOP_MODEL || DEFAULT_BYOP_MODEL);
  const url = resolve9RouterChatUrl(env);

  const structuredInput = {
    actionClass: cleanClass,
    toolName: cleanTool,
    sanitizedArgs: cleanArgs,
    taintState: cleanTaint,
  };

  return {
    url,
    model: modelId,
    actionClass: cleanClass,
    toolName: cleanTool,
    sanitizedArgs: cleanArgs,
    taintState: cleanTaint,
    requestBody: {
      model: modelId,
      temperature: 0,
      max_tokens: 64,
      messages: [
        {
          role: "system",
          content: "Classify tool commit safety. Reply strictly JSON: {\"decision\":\"allow\"|\"flag\",\"reason\":\"...\"}.",
        },
        {
          role: "user",
          content: JSON.stringify(structuredInput),
        },
      ],
    },
  };
}

/**
 * Verifikasi kelayakan laporan probe lokal untuk mengaktifkan LUMI_BYOP_MODE=enforce.
 * Syarat keras: FPR < 0.01 (<1%) DAN p95_ms <= 350.
 */
export function verifyProbeEligibility(probeReport) {
  let report = probeReport;
  if (typeof report === "string") {
    try {
      if (fs.existsSync(report)) report = JSON.parse(fs.readFileSync(report, "utf8"));
      else report = null;
    } catch {
      report = null;
    }
  }
  if (!report || typeof report !== "object") {
    return { eligible: false, reason: "probe-report-missing", fpr: null, p95_ms: null };
  }
  if (report.verified === false) {
    return { eligible: false, reason: "probe-not-verified", fpr: report.fpr ?? null, p95_ms: report.p95_ms ?? null };
  }
  const fpr = Number(report.fpr);
  const p95 = Number(report.p95_ms ?? report.p95Ms);
  if (!Number.isFinite(fpr) || fpr < 0 || fpr >= MAX_ENFORCE_FPR) {
    return {
      eligible: false,
      reason: `fpr-out-of-bounds (${Number.isFinite(fpr) ? fpr : "invalid"} >= ${MAX_ENFORCE_FPR})`,
      fpr: Number.isFinite(fpr) ? fpr : null,
      p95_ms: Number.isFinite(p95) ? p95 : null,
    };
  }
  if (!Number.isFinite(p95) || p95 <= 0 || p95 > MAX_ENFORCE_P95_MS) {
    return {
      eligible: false,
      reason: `p95-out-of-bounds (${Number.isFinite(p95) ? p95 : "invalid"} > ${MAX_ENFORCE_P95_MS}ms)`,
      fpr,
      p95_ms: Number.isFinite(p95) ? p95 : null,
    };
  }
  if (report.sample_count !== undefined && (!Number.isFinite(Number(report.sample_count)) || Number(report.sample_count) < 1)) {
    return { eligible: false, reason: "probe-sample-count-invalid", fpr, p95_ms: p95 };
  }
  return {
    eligible: true,
    reason: "verified-probe-eligible",
    fpr,
    p95_ms: p95,
  };
}

/**
 * Normalisasi LUMI_BYOP_MODE dengan enforce guard keras:
 * permintaan enforce tanpa probeReport valid (FPR < 1% & p95 <= 350 ms)
 * ditolak dan di-downgrade otomatis ke shadow.
 */
export function resolveByopMode(env = process.env, { probeReport = null, lumiHome = "" } = {}) {
  const raw = String(env?.LUMI_BYOP_MODE ?? "shadow").trim().toLowerCase();
  const requested = raw || "shadow";
  if (requested === "off") {
    return { requested: "off", effective: "off", downgraded: false, reason: "disabled-by-flag" };
  }
  if (requested === "enforce") {
    const report = probeReport ?? resolveByopProbePath(env, lumiHome);
    const elig = verifyProbeEligibility(report);
    if (!elig.eligible) {
      return {
        requested: "enforce",
        effective: "shadow",
        downgraded: true,
        reason: `enforce-downgraded-to-shadow: ${elig.reason}`,
        eligibility: elig,
      };
    }
    return {
      requested: "enforce",
      effective: "enforce",
      downgraded: false,
      reason: "verified-probe-eligible",
      eligibility: elig,
    };
  }
  if (requested === "shadow") {
    return { requested: "shadow", effective: "shadow", downgraded: false, reason: "shadow-default" };
  }
  return {
    requested,
    effective: "shadow",
    downgraded: true,
    reason: `unknown-mode-downgraded-to-shadow: ${requested}`,
  };
}

function parseGuardrailVerdict(body) {
  if (!body || typeof body !== "object") return { verdict: "flag", reason: "empty-response" };
  if (typeof body.decision === "string") {
    const d = body.decision.trim().toLowerCase();
    return { verdict: d === "allow" ? "allow" : "flag", reason: String(body.reason || d) };
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    try {
      const m = trimmed.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : trimmed);
      const d = String(parsed?.decision || parsed?.verdict || "").trim().toLowerCase();
      return {
        verdict: d === "allow" ? "allow" : "flag",
        reason: String(parsed?.reason || d || "model-flagged"),
      };
    } catch {
      if (/\ballow\b/i.test(trimmed) && !/\b(flag|deny|block|unsafe|risk)\b/i.test(trimmed)) {
        return { verdict: "allow", reason: "text-allow" };
      }
      return { verdict: "flag", reason: trimmed.slice(0, 120) || "unparseable-response" };
    }
  }
  return { verdict: "flag", reason: "unrecognized-payload" };
}

function appendShadowTelemetry(filePath, entry) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function evaluateByopGuardrail({
  actionClass = "lookup",
  toolName = "",
  sanitizedArgs,
  args,
  input,
  taintState = "clean",
  env = process.env,
  lumiHome = "",
  fetchImpl = globalThis.fetch,
  model,
  timeoutMs = DEFAULT_BYOP_TIMEOUT_MS,
  probeReport = null,
  headless = false,
  telemetryPath,
} = {}) {
  const modeInfo = resolveByopMode(env, { probeReport, lumiHome });
  const telPath = telemetryPath || resolveByopTelemetryPath(env, lumiHome);

  if (modeInfo.effective === "off") {
    return {
      decision: "allow",
      allowed: true,
      skipped: true,
      mode: "off",
      requestedMode: modeInfo.requested,
      downgraded: false,
      actionClass,
      reason: "byop-off",
      telemetryPath: telPath,
    };
  }

  if (actionClass !== "commit") {
    return {
      decision: "allow",
      allowed: true,
      skipped: true,
      mode: modeInfo.effective,
      requestedMode: modeInfo.requested,
      downgraded: modeInfo.downgraded,
      actionClass,
      reason: "non-commit-action",
      telemetryPath: telPath,
    };
  }

  const payload = buildGuardrailPayload({
    actionClass,
    toolName,
    sanitizedArgs: sanitizedArgs ?? args ?? input ?? {},
    taintState,
    model,
    env,
  });

  const t0 = performance.now();
  let shadowVerdict = "allow";
  let verdictReason = "allow";
  let timedOut = false;
  let errorDetail = null;

  try {
    if (typeof fetchImpl !== "function") {
      throw new Error("fetchImpl-unavailable");
    }
    const key = resolveCompat9RouterKey(env);
    const headers = {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    };
    const res = await fetchImpl(payload.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload.requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res || !res.ok) {
      shadowVerdict = "error";
      verdictReason = `http-${res?.status ?? "unknown"}`;
    } else {
      const data = await res.json();
      const parsed = parseGuardrailVerdict(data);
      shadowVerdict = parsed.verdict;
      verdictReason = parsed.reason;
    }
  } catch (err) {
    timedOut = err?.name === "TimeoutError" || err?.name === "AbortError" || /timeout|abort/i.test(String(err?.message ?? err));
    shadowVerdict = timedOut ? "timeout" : "error";
    errorDetail = String(err?.message ?? err);
    verdictReason = timedOut ? `timeout-${timeoutMs}ms` : errorDetail;
  }

  const latencyMs = Number((performance.now() - t0).toFixed(2));
  const shouldBlockEnforce = modeInfo.effective === "enforce" && shadowVerdict !== "allow";
  const finalDecision = shouldBlockEnforce ? (headless ? "deny" : "ask") : "allow";

  appendShadowTelemetry(telPath, {
    mode: modeInfo.effective,
    requestedMode: modeInfo.requested,
    downgraded: modeInfo.downgraded,
    downgradeReason: modeInfo.downgraded ? modeInfo.reason : null,
    actionClass: payload.actionClass,
    toolName: payload.toolName,
    taintState: payload.taintState,
    model: payload.model,
    url: payload.url,
    shadowVerdict,
    decision: finalDecision,
    reason: verdictReason,
    timedOut,
    latencyMs,
  });

  return {
    decision: finalDecision,
    allowed: finalDecision === "allow",
    skipped: false,
    mode: modeInfo.effective,
    requestedMode: modeInfo.requested,
    downgraded: modeInfo.downgraded,
    downgradeReason: modeInfo.downgraded ? modeInfo.reason : undefined,
    shadowVerdict,
    reason: verdictReason,
    timedOut,
    latencyMs,
    telemetryPath: telPath,
    payload,
  };
}
