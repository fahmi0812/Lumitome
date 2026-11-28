/**
 * Cascade Router Core (M2 / T3.3 + T3.5):
 * - 3-tier cascade (tier0_micro -> tier1_fast -> tier2_frontier) eksklusif via 9router.
 * - Hard invariant: providerID TIDAK PERNAH diubah di luar "9router".
 * - Fallback deterministik: bila model target tidak ada di availableModels live, jatuh ke model sesi saat ini.
 * - Never-downgrade: thinking, reviewer, design-critic (serta tugas security/architecture).
 * - Flag prunable SHarP: LUMI_CASCADE / LUMI_CASCADE_ROUTING & LUMI_PLAN_PREPASS.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const NINEROUTER_PROVIDER_ID = "9router";
export const NEVER_DOWNGRADE_ROLES = new Set(["thinking", "reviewer", "design-critic"]);
export const NEVER_DOWNGRADE_TASKS = new Set(["security", "architecture"]);
export const AUXILIARY_KINDS = new Set(["title", "compaction", "generate"]);

export const DEFAULT_MODEL_PROFILES = {
  version: 1,
  prunable: true,
  feature_flag: "LUMI_CASCADE_ROUTING",
  providerID: "9router",
  never_downgrade_roles: ["thinking", "reviewer", "design-critic"],
  never_downgrade_tasks: ["security", "architecture"],
  plan_prepass: {
    enabled: true,
    feature_flag: "LUMI_PLAN_PREPASS",
    max_tokens: 300,
    active_for_roles: ["thinking"],
    active_for_complexities: ["complex", "thinking"],
    disabled_for_complexities: ["trivial"],
  },
  tiers: {
    tier0_micro: {
      providerID: "9router",
      model_patterns: ["*flash-lite*", "*mini*", "*nano*", "*haiku*"],
      allow_auxiliary_kinds: ["title", "generate"],
    },
    tier1_fast: {
      providerID: "9router",
      model_patterns: ["*gemini*flash*", "*flash*", "*sonnet*", "*mini*"],
      allow_auxiliary_kinds: ["title", "compaction", "generate"],
    },
    tier2_frontier: {
      providerID: "9router",
      model_patterns: ["*claude*opus*", "*opus*", "*claude*sonnet*", "*gpt-5*", "*o3*", "*gemini*pro*", "*neon*"],
      allow_auxiliary_kinds: ["compaction"],
    },
  },
  profiles: [],
};

function matchGlob(text, patternSpec) {
  const s = String(text ?? "").toLowerCase();
  const patterns = String(patternSpec ?? "").split("|").map((p) => p.trim().toLowerCase()).filter(Boolean);
  for (const pat of patterns) {
    const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    if (new RegExp(`^${escaped}$`, "i").test(s)) return true;
  }
  return false;
}

export function stripProviderPrefix(modelId) {
  const s = String(modelId ?? "").trim();
  return s.startsWith("9router/") ? s.slice("9router/".length) : s;
}

export function loadModelProfiles(repoRoot = "") {
  if (repoRoot) {
    const p = path.join(path.resolve(repoRoot), "router", "model_profiles.json");
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {}
  }
  return DEFAULT_MODEL_PROFILES;
}

export function loadLiveNineRouterModels(lumiHome = "") {
  const home = lumiHome || process.env.LUMI_HOME || path.join(process.env.HOME || os.homedir(), ".lumitome");
  const provFile = path.join(home, "providers.json");
  try {
    const data = JSON.parse(fs.readFileSync(provFile, "utf8"));
    const nr = data?.providers?.["9router"];
    const models = Array.isArray(nr?.models) ? nr.models.map((m) => stripProviderPrefix(m)).filter(Boolean) : [];
    const limits = nr?.limits && typeof nr.limits === "object" ? nr.limits : {};
    return { models, limits };
  } catch {
    return { models: [], limits: {} };
  }
}

export function loadUserSubagentPreset(lumiHome = "") {
  const home = lumiHome || process.env.LUMI_HOME || path.join(process.env.HOME || os.homedir(), ".lumitome");
  try {
    const p = path.join(home, "lumitome-subagent.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return null;
}

export function isCascadeEnabled(env = process.env) {
  const f1 = env?.LUMI_CASCADE;
  const f2 = env?.LUMI_CASCADE_ROUTING;
  if (f1 === "0" || f1 === "false") return false;
  if (f2 === "0" || f2 === "false") return false;
  return true;
}

export function isPlanPrepassEnabled(env = process.env) {
  const f = env?.LUMI_PLAN_PREPASS;
  if (f === "0" || f === "false") return false;
  return true;
}

export function resolvePlanPrepass({ role = "", agent = "", taskComplexity = "standard", env = process.env, profiles = DEFAULT_MODEL_PROFILES } = {}) {
  const pp = profiles?.plan_prepass || DEFAULT_MODEL_PROFILES.plan_prepass;
  if (!isPlanPrepassEnabled(env) || pp?.enabled === false) {
    return { active: false, maxTokens: 0, reason: "flag-disabled" };
  }
  const comp = String(taskComplexity || "standard").toLowerCase();
  const r = String(role || agent || "").toLowerCase();
  const disabledComps = new Set((pp?.disabled_for_complexities || ["trivial"]).map((x) => String(x).toLowerCase()));
  if (disabledComps.has(comp)) {
    return { active: false, maxTokens: 0, reason: "trivial-task" };
  }
  const activeRoles = new Set((pp?.active_for_roles || ["thinking"]).map((x) => String(x).toLowerCase()));
  const activeComps = new Set((pp?.active_for_complexities || ["complex", "thinking"]).map((x) => String(x).toLowerCase()));
  if (activeRoles.has(r) || activeComps.has(comp)) {
    return { active: true, maxTokens: Number(pp?.max_tokens || 300), reason: activeRoles.has(r) ? `role:${r}` : `complexity:${comp}` };
  }
  return { active: false, maxTokens: 0, reason: "not-required" };
}

function normalizeAvailableModels(availableModels) {
  if (!Array.isArray(availableModels)) return null;
  return availableModels.map((m) => stripProviderPrefix(m)).filter(Boolean);
}

function matchTierCandidate(tierCfg, availList) {
  if (!tierCfg || !Array.isArray(availList) || availList.length === 0) return null;
  const patterns = Array.isArray(tierCfg.model_patterns) ? tierCfg.model_patterns : [];
  for (const pat of patterns) {
    const hit = availList.find((m) => matchGlob(m, pat));
    if (hit) return hit;
  }
  const ph = tierCfg.placeholder_model;
  if (typeof ph === "string" && ph && !ph.startsWith("<")) {
    const cleanPh = stripProviderPrefix(ph);
    if (availList.includes(cleanPh)) return cleanPh;
  }
  return null;
}

function isTier1OrLower(modelId, profiles) {
  const id = stripProviderPrefix(modelId);
  const t0 = profiles?.tiers?.tier0_micro?.model_patterns || [];
  const t1 = profiles?.tiers?.tier1_fast?.model_patterns || [];
  const t2 = profiles?.tiers?.tier2_frontier?.model_patterns || [];
  if (t2.some((p) => matchGlob(id, p))) return false;
  return t0.some((p) => matchGlob(id, p)) || t1.some((p) => matchGlob(id, p));
}

/**
 * Resolusi model cascade 3-tier untuk OpenCode experimental.model.resolve.
 * Invarian keras: tidak pernah mengubah providerID di luar "9router".
 */
export function resolveCascadeModel({
  event = {},
  preset = null,
  availableModels = null,
  profiles = DEFAULT_MODEL_PROFILES,
  state = {},
  env = process.env,
} = {}) {
  const origModel = event?.model && typeof event.model === "object"
    ? { ...event.model }
    : { providerID: NINEROUTER_PROVIDER_ID, id: "" };
  const origProvider = String(origModel.providerID || NINEROUTER_PROVIDER_ID);

  // Invarian keras: hanya menyentuh provider "9router"
  if (origProvider !== NINEROUTER_PROVIDER_ID) {
    return {
      changed: false,
      model: origModel,
      providerID: origProvider,
      reason: "non-9router-passthrough",
      tier: null,
      fallback: false,
      prepass: { active: false, maxTokens: 0, reason: "non-9router" },
    };
  }

  const currentId = stripProviderPrefix(origModel.id);
  const agent = String(event?.agent || "").toLowerCase();
  const kind = String(event?.kind || "primary").toLowerCase();
  const taskType = String(state?.taskType || event?.taskType || "").toLowerCase();
  const taskComplexity = String(
    state?.taskComplexity || event?.taskComplexity || (agent === "thinking" ? "thinking" : "standard"),
  ).toLowerCase();

  const prepass = resolvePlanPrepass({ role: agent, agent, taskComplexity, env, profiles });

  if (!isCascadeEnabled(env)) {
    return {
      changed: false,
      model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID },
      providerID: NINEROUTER_PROVIDER_ID,
      reason: "cascade-disabled",
      tier: null,
      fallback: false,
      prepass,
    };
  }

  const avail = normalizeAvailableModels(availableModels);
  const isAvailable = (id) => {
    const clean = stripProviderPrefix(id);
    if (!clean) return false;
    if (avail === null) return true;
    return avail.includes(clean);
  };

  const neverRoles = new Set((profiles?.never_downgrade_roles || [...NEVER_DOWNGRADE_ROLES]).map((x) => String(x).toLowerCase()));
  const neverTasks = new Set((profiles?.never_downgrade_tasks || [...NEVER_DOWNGRADE_TASKS]).map((x) => String(x).toLowerCase()));
  const tiers = profiles?.tiers || DEFAULT_MODEL_PROFILES.tiers;

  // 1) Never-downgrade: thinking, reviewer, design-critic, security, architecture
  if (kind === "primary" && (neverRoles.has(agent) || neverTasks.has(taskType) || neverTasks.has(taskComplexity))) {
    let target = currentId;
    let fallback = false;
    const presetModel = preset?.enabled !== false ? preset?.roles?.[agent]?.model : null;
    if (typeof presetModel === "string" && presetModel.startsWith("9router/")) {
      const cand = stripProviderPrefix(presetModel);
      if (isAvailable(cand) && !isTier1OrLower(cand, profiles)) {
        target = cand;
      } else if (avail !== null && !isAvailable(cand)) {
        fallback = true;
      }
    }
    if (target === currentId && isTier1OrLower(currentId, profiles)) {
      const t2Cand = matchTierCandidate(tiers.tier2_frontier, avail || []);
      if (t2Cand && isAvailable(t2Cand)) {
        target = t2Cand;
      } else {
        fallback = true;
      }
    }
    // Pastikan tidak pernah turun ke Tier 0/1 jika currentId sudah frontier
    if (!isTier1OrLower(currentId, profiles) && isTier1OrLower(target, profiles)) {
      target = currentId;
      fallback = true;
    }
    return {
      changed: target !== currentId && Boolean(target),
      model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID, id: target || currentId },
      providerID: NINEROUTER_PROVIDER_ID,
      reason: "never-downgrade",
      tier: "tier2_frontier",
      fallback,
      prepass,
    };
  }

  // 2) Auxiliary kinds: title, compaction, generate -> tier1_fast (fallback ke current bila tidak tersedia)
  if (AUXILIARY_KINDS.has(kind)) {
    const t1Cand = matchTierCandidate(tiers.tier1_fast, avail || [])
      || (kind !== "compaction" ? matchTierCandidate(tiers.tier0_micro, avail || []) : null);
    if (t1Cand && isAvailable(t1Cand)) {
      return {
        changed: t1Cand !== currentId,
        model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID, id: t1Cand },
        providerID: NINEROUTER_PROVIDER_ID,
        reason: `auxiliary-${kind}`,
        tier: "tier1_fast",
        fallback: false,
        prepass,
      };
    }
    return {
      changed: false,
      model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID },
      providerID: NINEROUTER_PROVIDER_ID,
      reason: `auxiliary-${kind}-fallback`,
      tier: "tier1_fast",
      fallback: true,
      prepass,
    };
  }

  // 3) Subagent search -> tier1_fast bila tersedia di live 9router
  if (agent === "search") {
    const presetSearch = preset?.enabled !== false ? preset?.roles?.search?.model : null;
    const cand = (typeof presetSearch === "string" && presetSearch.startsWith("9router/"))
      ? stripProviderPrefix(presetSearch)
      : matchTierCandidate(tiers.tier1_fast, avail || []);
    if (cand && isAvailable(cand)) {
      return {
        changed: cand !== currentId,
        model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID, id: cand },
        providerID: NINEROUTER_PROVIDER_ID,
        reason: "role-search-fast",
        tier: "tier1_fast",
        fallback: false,
        prepass,
      };
    }
    return {
      changed: false,
      model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID },
      providerID: NINEROUTER_PROVIDER_ID,
      reason: "role-search-fallback",
      tier: "tier1_fast",
      fallback: true,
      prepass,
    };
  }

  // 4) Builder / tugas utama: eskalasi ke Tier 2 jika gagal/stagnan/multiFile/complex; tier1_fast jika trivial/low
  const shouldEscalate = Boolean(
    (state?.failedAttempts && state.failedAttempts > 0) ||
    state?.stagnant ||
    state?.multiFile ||
    taskComplexity === "complex" ||
    taskComplexity === "thinking",
  );

  if (shouldEscalate) {
    const presetBuilder = preset?.enabled !== false && agent === "builder" ? preset?.roles?.builder?.model : null;
    const cand = (typeof presetBuilder === "string" && presetBuilder.startsWith("9router/") && !isTier1OrLower(presetBuilder, profiles))
      ? stripProviderPrefix(presetBuilder)
      : matchTierCandidate(tiers.tier2_frontier, avail || []);
    if (cand && isAvailable(cand)) {
      return {
        changed: cand !== currentId,
        model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID, id: cand },
        providerID: NINEROUTER_PROVIDER_ID,
        reason: "escalate-tier2",
        tier: "tier2_frontier",
        fallback: false,
        prepass,
      };
    }
    return {
      changed: false,
      model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID },
      providerID: NINEROUTER_PROVIDER_ID,
      reason: "escalate-tier2-fallback",
      tier: "tier2_frontier",
      fallback: true,
      prepass,
    };
  }

  if (taskComplexity === "trivial" || taskComplexity === "low") {
    const cand = matchTierCandidate(tiers.tier1_fast, avail || []);
    if (cand && isAvailable(cand)) {
      return {
        changed: cand !== currentId,
        model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID, id: cand },
        providerID: NINEROUTER_PROVIDER_ID,
        reason: "trivial-tier1",
        tier: "tier1_fast",
        fallback: false,
        prepass,
      };
    }
    return {
      changed: false,
      model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID },
      providerID: NINEROUTER_PROVIDER_ID,
      reason: "trivial-tier1-fallback",
      tier: "tier1_fast",
      fallback: true,
      prepass,
    };
  }

  return {
    changed: false,
    model: { ...origModel, providerID: NINEROUTER_PROVIDER_ID },
    providerID: NINEROUTER_PROVIDER_ID,
    reason: "keep-session-model",
    tier: isTier1OrLower(currentId, profiles) ? "tier1_fast" : "tier2_frontier",
    fallback: false,
    prepass,
  };
}

/**
 * Catat kalibrasi token EMA & cache hit ratio dari respons 9router ke $LUMI_HOME/telemetry/token-calibration.json.
 */
export function recordTokenCalibration({ lumiHome, modelId, sentChars = 0, usage = {} } = {}) {
  try {
    const home = lumiHome || process.env.LUMI_HOME || path.join(process.env.HOME || os.homedir(), ".lumitome");
    const promptTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
    if (!Number.isFinite(promptTokens) || promptTokens <= 0) return null;
    const cachedTokens = Number(usage?.prompt_tokens_details?.cached_tokens ?? usage?.cache_read_input_tokens ?? 0);
    const cacheHitRatio = Number(Math.max(0, Math.min(1, cachedTokens / promptTokens)).toFixed(4));
    const file = path.join(home, "telemetry", "token-calibration.json");
    let data = { models: {} };
    try {
      if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, "utf8")) || { models: {} };
    } catch {}
    data.models ||= {};
    const key = String(modelId || "unknown");
    const prev = data.models[key] || { emaCharsPerToken: 3.5, avgCacheHitRatio: cacheHitRatio, samples: 0 };
    let ema = prev.emaCharsPerToken;
    if (sentChars > 0) {
      const obs = Math.max(1.2, Math.min(8.0, sentChars / promptTokens));
      ema = Number((prev.samples === 0 ? obs : prev.emaCharsPerToken * 0.8 + obs * 0.2).toFixed(4));
    }
    const samples = (prev.samples || 0) + 1;
    const avgCacheHitRatio = Number(
      (prev.samples === 0 ? cacheHitRatio : prev.avgCacheHitRatio * 0.8 + cacheHitRatio * 0.2).toFixed(4),
    );
    data.models[key] = { emaCharsPerToken: ema, avgCacheHitRatio, lastCacheHitRatio: cacheHitRatio, samples, updatedAt: new Date().toISOString() };
    data.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
    return data.models[key];
  } catch {
    return null;
  }
}
