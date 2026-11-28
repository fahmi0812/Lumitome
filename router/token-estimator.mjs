/**
 * Calibrated Token Estimator & Overthink Guard (M2 / T3.4).
 * Kepatuhan LINT-004a: hanya impor node:* atau ./ (dilarang impor ../).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = path.join(HERE, "model_profiles.json");

let _cachedProfiles = null;

export function loadModelProfiles(profilesPath = PROFILES_PATH) {
  if (profilesPath === PROFILES_PATH && _cachedProfiles) return _cachedProfiles;
  try {
    const data = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
    if (profilesPath === PROFILES_PATH) _cachedProfiles = data;
    return data;
  } catch {
    return {
      version: 1,
      defaults: {
        max_thinking_tokens: 8192,
        safety_factor: 1.08,
        calibrated_chars_per_token: { prose: 3.9, code: 3.2, unicode: 2.0, mixed: 3.5 },
      },
      profiles: [],
    };
  }
}

export function matchGlobPattern(text, patternSpec) {
  const s = String(text ?? "").toLowerCase();
  const patterns = String(patternSpec ?? "").split("|").map((p) => p.trim().toLowerCase()).filter(Boolean);
  for (const pat of patterns) {
    const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    if (new RegExp(`^${escaped}$`, "i").test(s)) return true;
  }
  return false;
}

export function matchModelProfile(modelId, profilesDoc = loadModelProfiles()) {
  const list = Array.isArray(profilesDoc?.profiles) ? profilesDoc.profiles : [];
  for (const prof of list) {
    if (prof?.pattern && matchGlobPattern(modelId, prof.pattern)) return prof;
  }
  return null;
}

/**
 * Klasifikasi komposisi teks secara deterministik (0 dependensi): prose vs code vs unicode.
 */
export function classifyContent(text) {
  const s = String(text ?? "");
  const len = s.length;
  if (len === 0) return { len: 0, kind: "prose", codeRatio: 0, unicodeRatio: 0 };
  let codeChars = 0;
  let unicodeChars = 0;
  for (let i = 0; i < len; i++) {
    const code = s.charCodeAt(i);
    if (code > 127) {
      unicodeChars++;
    } else if (
      code === 123 || code === 125 || // { }
      code === 91 || code === 93 ||   // [ ]
      code === 40 || code === 41 ||   // ( )
      code === 59 || code === 61 ||   // ; =
      code === 60 || code === 62 ||   // < >
      code === 124 || code === 38 ||  // | &
      code === 42 || code === 47 ||   // * /
      code === 43 || code === 92      // + \
    ) {
      codeChars++;
    }
  }
  const codeRatio = codeChars / len;
  const unicodeRatio = unicodeChars / len;
  let kind = "prose";
  if (unicodeRatio >= 0.25) kind = "unicode";
  else if (codeRatio >= 0.06) kind = "code";
  else if (codeRatio >= 0.02 || unicodeRatio >= 0.06) kind = "mixed";
  return { len, kind, codeRatio, unicodeRatio };
}

/**
 * Estimator token terkalibrasi cepat untuk kode + teks ID/EN.
 */
export function estimateTokens(text, { modelId = "", safetyFactor, profilesDoc } = {}) {
  const s = String(text ?? "");
  if (!s.length) return 0;
  const doc = profilesDoc || loadModelProfiles();
  const prof = modelId ? matchModelProfile(modelId, doc) : null;
  const cal = {
    prose: 3.9,
    code: 3.2,
    unicode: 2.0,
    mixed: 3.5,
    ...(doc?.defaults?.calibrated_chars_per_token || {}),
    ...(prof?.calibrated_chars_per_token || {}),
  };
  const sf = Number.isFinite(safetyFactor)
    ? safetyFactor
    : Number(doc?.defaults?.safety_factor ?? 1.08);
  const cls = classifyContent(s);
  const baseDiv = cal[cls.kind] ?? cal.mixed;
  // Penyesuaian halus bila teks campuran memuat unicode/simbol kode cukup tinggi
  const penalty = Math.max(0.55, 1 - cls.unicodeRatio * 0.45 - Math.min(0.25, cls.codeRatio * 1.2));
  const effDiv = Math.max(1.4, Math.min(baseDiv, baseDiv * penalty + baseDiv * (1 - penalty) * 0.85));
  return Math.ceil((s.length / effDiv) * sf);
}

const COMPLEXITY_BUDGETS = {
  trivial: { maxReasoningTokens: 1024, maxOutputTokens: 2048, maxSteps: 4 },
  standard: { maxReasoningTokens: 4096, maxOutputTokens: 8192, maxSteps: 10 },
  complex: { maxReasoningTokens: 8192, maxOutputTokens: 16384, maxSteps: 18 },
  thinking: { maxReasoningTokens: 16384, maxOutputTokens: 32768, maxSteps: 24 },
};

/**
 * Hitung budget dinamis & Overthink Guard (LUMI_OVERTHINK_GUARD=1 default, 0 untuk disable).
 */
export function computeDynamicBudget({
  contextWindow = 128000,
  usedTokens = 0,
  taskComplexity = "standard",
  env = process.env,
  modelId = "",
} = {}) {
  const win = Math.max(1024, Number(contextWindow) || 128000);
  const used = Math.max(0, Number(usedTokens) || 0);
  const remainingTokens = Math.max(0, win - used);
  const usedRatio = Number((used / win).toFixed(4));
  const normComp = String(taskComplexity || "standard").toLowerCase();
  const complexity = COMPLEXITY_BUDGETS[normComp] ? normComp : "standard";
  const overthinkGuardActive = String(env?.LUMI_OVERTHINK_GUARD ?? "1") !== "0";

  const pressure = usedRatio >= 0.85 ? "high" : usedRatio >= 0.65 ? "medium" : "low";
  const shouldCompact = usedRatio >= 0.85;
  const escalateToFrontier = usedRatio > 0.65 || complexity === "complex" || complexity === "thinking";

  if (!overthinkGuardActive) {
    return {
      taskComplexity: complexity,
      overthinkGuardActive: false,
      contextWindow: win,
      usedTokens: used,
      remainingTokens,
      usedRatio,
      pressure,
      shouldCompact,
      escalateToFrontier,
      maxReasoningTokens: Math.min(32768, remainingTokens),
      maxOutputTokens: Math.min(65536, remainingTokens),
      maxSteps: null,
    };
  }

  const base = COMPLEXITY_BUDGETS[complexity];
  const prof = modelId ? matchModelProfile(modelId) : null;
  const profReasoningCap = Number(prof?.max_thinking_tokens ?? base.maxReasoningTokens);
  const profOutputCap = Number(prof?.max_output_tokens ?? base.maxOutputTokens);

  const availCap = Math.max(256, Math.floor(remainingTokens * 0.6));
  const maxReasoningTokens = Math.min(base.maxReasoningTokens, profReasoningCap, availCap);
  const maxOutputTokens = Math.min(base.maxOutputTokens, profOutputCap, Math.max(512, remainingTokens));
  const maxSteps = pressure === "high" ? Math.max(2, Math.floor(base.maxSteps * 0.6)) : base.maxSteps;

  return {
    taskComplexity: complexity,
    overthinkGuardActive: true,
    contextWindow: win,
    usedTokens: used,
    remainingTokens,
    usedRatio,
    pressure,
    shouldCompact,
    escalateToFrontier,
    maxReasoningTokens,
    maxOutputTokens,
    maxSteps,
  };
}
