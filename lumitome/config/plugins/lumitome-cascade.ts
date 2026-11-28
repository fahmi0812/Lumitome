/**
 * Lumitome Cascade Router Plugin (M2 / T3.3 + T3.5).
 * - Hook experimental.model.resolve (lewat experimental-adapter.mjs agar aman di OpenCode 2.3.0).
 * - Invarian keras: tidak pernah mengganti providerID di luar "9router".
 * - Mendukung LUMI_CASCADE / LUMI_CASCADE_ROUTING=0 dan LUMI_PLAN_PREPASS=0/1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLumiHome, registerExperimentalHook } from "./lib/experimental-adapter.mjs";
import {
  NINEROUTER_PROVIDER_ID,
  loadModelProfiles,
  loadLiveNineRouterModels,
  loadUserSubagentPreset,
  resolveCascadeModel,
  resolvePlanPrepass,
  recordTokenCalibration,
} from "./lib/cascade-core.mjs";

export { resolveCascadeModel, resolvePlanPrepass, loadModelProfiles, loadLiveNineRouterModels };

function resolveRepoRootSafe() {
  if (process.env.LUMI_REPO && fs.existsSync(path.join(process.env.LUMI_REPO, "router", "model_profiles.json"))) {
    return path.resolve(process.env.LUMI_REPO);
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  try {
    dir = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
  } catch {}
  return path.resolve(dir, ["..", "..", ".."].join("/"));
}

export default {
  id: "lumitome-cascade",
  async setup(ctx: any) {
    const env = process.env;
    const home = defaultLumiHome(env);
    const repoRoot = resolveRepoRootSafe();
    const profiles = loadModelProfiles(repoRoot);
    const sessionState = new Map<string, { failedAttempts: number; stagnant: boolean; multiFile: boolean; taskComplexity?: string; taskType?: string }>();

    const getState = (sid: string) => {
      const key = String(sid || "default");
      if (!sessionState.has(key)) {
        sessionState.set(key, { failedAttempts: 0, stagnant: false, multiFile: false });
      }
      return sessionState.get(key)!;
    };

    if (typeof ctx?.tool?.hook === "function") {
      await ctx.tool.hook("execute.after", (e: any) => {
        const sid = String(e?.sessionID || env.LUMI_SESSION_ID || "default");
        const st = getState(sid);
        const tool = String(e?.tool || "");
        if (tool === "shell" || tool === "bash") {
          const exit = e?.result?.metadata?.exit ?? e?.result?.output?.exitCode ?? e?.result?.output?.exit;
          if (typeof exit === "number" && exit !== 0) st.failedAttempts += 1;
          else if (exit === 0) st.failedAttempts = 0;
        }
      });
    }

    await registerExperimentalHook(
      ctx,
      "experimental.model.resolve",
      (event: any) => {
        if (!event || typeof event !== "object") return;
        if (event?.model?.providerID && event.model.providerID !== NINEROUTER_PROVIDER_ID) return;
        const sid = String(event?.sessionID || env.LUMI_SESSION_ID || "default");
        const { models } = loadLiveNineRouterModels(home);
        const preset = loadUserSubagentPreset(home);
        const res = resolveCascadeModel({
          event,
          preset,
          availableModels: models.length ? models : null,
          profiles,
          state: getState(sid),
          env,
        });
        if (res.changed && res.model && res.model.providerID === NINEROUTER_PROVIDER_ID && res.model.id) {
          event.model = res.model;
        }
      },
      { home, fallback: "static-subagent-preset" },
    );

    await registerExperimentalHook(
      ctx,
      "http.response",
      (event: any) => {
        try {
          const usage = event?.usage ?? event?.body?.usage;
          if (usage && typeof usage === "object") {
            recordTokenCalibration({
              lumiHome: home,
              modelId: event?.model?.id ?? event?.modelId ?? "unknown",
              sentChars: Number(event?.sentChars ?? 0),
              usage,
            });
          }
        } catch {
          // telemetri kalibrasi fail-silent
        }
      },
      { home, fallback: "no-online-calibration" },
    );
  },
};
